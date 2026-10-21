// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {Vm} from "forge-std/Vm.sol";
import {PontoonLauncher} from "../src/PontoonLauncher.sol";
import {TokenRegistry} from "../src/TokenRegistry.sol";
import {BuybackExecutor} from "../src/BuybackExecutor.sol";
import {HolderRewards} from "../src/HolderRewards.sol";
import {PlatformTreasury} from "../src/PlatformTreasury.sol";
import {FeeConfig, ITokenRegistry} from "../src/interfaces/IPontoon.sol";

contract LauncherTest is BaseTest {
    function test_launch_registersEverything() public view {
        ITokenRegistry.TokenInfo memory info = registry.getToken(address(token));
        assertEq(info.creator, creator);
        assertEq(info.vault, address(vault));
        assertEq(info.curve, address(curve));
        assertEq(info.quoteAsset, address(0));
        assertFalse(info.graduated);
        assertEq(vault.admin(), creator);
        assertEq(vault.token(), address(token));
        assertEq(address(rewards.stakingToken()), address(token));
        assertEq(registry.tokenCount(), 1);
    }

    function test_launch_passesPonsParams() public view {
        assertEq(curve.creatorTaxBps(), 300, "default creator tax");
        assertEq(curve.feeRecipient(), address(vault));
        assertEq(pons.exemptionsSeen(0), creator, "creator exempt from snipe tax");
    }

    function test_launch_requiresPonsLaunchFee() public {
        vm.deal(alice, 1 ether);
        uint256 fee = launcher.launchFee();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PontoonLauncher.InsufficientLaunchFee.selector, fee));
        launcher.launch{value: fee - 1}(_meta(), address(0), false, FeeConfig(0, 0));
    }

    function test_launch_onlyEthPairForNow() public {
        address usdg = makeAddr("USDG");
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PontoonLauncher.QuotePairNotAllowed.selector);
        launcher.launch{value: 0.0005 ether}(_meta(), usdg, true, FeeConfig(0, 0));
        vm.prank(multisig);
        vm.expectRevert(PontoonLauncher.QuotePairNotAllowed.selector);
        launcher.setQuotePair(usdg, true);
    }

    function test_launch_initialBuyGoesToCreator() public {
        vm.deal(alice, 1 ether);
        uint256 fee = launcher.launchFee();
        vm.prank(alice);
        (address t,) = launcher.launch{value: fee + 0.2 ether}(_meta(), address(0), false, FeeConfig(0, 0));
        assertGt(MockBalance(t).balanceOf(alice), 0);
        assertEq(alice.balance, 1 ether - fee - 0.2 ether);
    }

    function test_launch_memestockTag() public {
        vm.deal(alice, 1 ether);
        uint256 fee = launcher.launchFee();
        vm.prank(alice);
        (address t,) = launcher.launch{value: fee}(_meta(), address(0), true, FeeConfig(0, 0));
        assertTrue(registry.getToken(t).isMemestock);
    }

    function test_launch_failsWhenPonsDisabled() public {
        pons.setLaunchEnabled(false);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PontoonLauncher.PonsLaunchDisabled.selector);
        launcher.launch{value: 0.0005 ether}(_meta(), address(0), false, FeeConfig(0, 0));
    }

    function test_creatorTax_cappedByPons() public {
        vm.startPrank(multisig);
        launcher.setCreatorTaxBps(1000);
        vm.expectRevert(PontoonLauncher.FeeTooHigh.selector);
        launcher.setCreatorTaxBps(1001);
        vm.stopPrank();
    }

    function test_pause_blocksLaunch() public {
        vm.prank(multisig);
        launcher.setPaused(true);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PontoonLauncher.IsPaused.selector);
        launcher.launch{value: 0.0005 ether}(_meta(), address(0), false, FeeConfig(0, 0));
    }

    function test_registry_onlyLauncherRegisters() public {
        vm.expectRevert(TokenRegistry.NotLauncher.selector);
        registry.register(address(1), address(4), alice, address(0), false, address(2), address(3));
    }

    function test_registry_markGraduated() public {
        vm.expectRevert(TokenRegistry.NotGraduated.selector);
        registry.markGraduated(address(token));
        curve.forceGraduate();
        assertTrue(registry.isGraduated(address(token)), "reads the curve");
        registry.markGraduated(address(token));
        assertTrue(registry.getToken(address(token)).graduated);
        vm.expectRevert(TokenRegistry.AlreadyGraduated.selector);
        registry.markGraduated(address(token));
    }
}

interface MockBalance {
    function balanceOf(address) external view returns (uint256);
}

contract BuybackTest is BaseTest {
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function setUp() public override {
        super.setUp();
        _payFee(10 ether);
        vault.distribute(); // 3.1984 ETH pending buyback
    }

    function test_cap_isOnePercentOfCurveLiquidity() public view {
        // quoteReserve = 1.68 ETH phantom + 0 real -> 1% = 0.0168 ETH
        assertEq(executor.maxBuyback(address(token)), 0.0168 ether);
    }

    function test_buyback_onCurve_burnsToDead() public {
        uint256 amount = executor.maxBuyback(address(token));
        vm.prank(keeper);
        uint256 burned = executor.buybackAndBurn(address(token), amount, 1);
        assertGt(burned, 0);
        assertEq(token.balanceOf(DEAD), burned);
        assertEq(executor.totalBurned(address(token)), burned);
        assertEq(executor.totalETHSpent(address(token)), amount);
        // The buyback itself paid creator tax back into this token's vault (via the curve).
        assertGt(curve.pendingCreatorFees(), 0);
    }

    function test_cap_growsWithLiquidity() public {
        _buy(bob, 2 ether);
        assertGt(executor.maxBuyback(address(token)), 0.0168 ether);
    }

    function test_buyback_requiresMinOut() public {
        vm.expectRevert(BuybackExecutor.ZeroMinOut.selector);
        executor.buybackAndBurn(address(token), 0.01 ether, 0);
    }

    function test_buyback_capped() public {
        vm.expectRevert(abi.encodeWithSelector(BuybackExecutor.ExceedsCap.selector, 0.0168 ether));
        executor.buybackAndBurn(address(token), 0.0168 ether + 1, 1);
    }

    function test_buyback_cannotSpendMoreThanPending() public {
        uint256 pending = executor.pendingETH(address(token));
        vm.expectRevert(BuybackExecutor.InsufficientPending.selector);
        executor.buybackAndBurn(address(token), pending + 1, 1);
    }

    function test_buyback_slippageReverts() public {
        vm.expectRevert("slippage");
        executor.buybackAndBurn(address(token), 0.01 ether, type(uint128).max);
    }

    function test_graduated_noBuyback_redirectToRewards() public {
        curve.forceGraduate();
        assertEq(executor.maxBuyback(address(token)), 0);
        vm.expectRevert(BuybackExecutor.Graduated.selector);
        executor.buybackAndBurn(address(token), 0.01 ether, 1);

        _stake(alice, 100e18);
        uint256 pending = executor.pendingETH(address(token));
        uint256 before = address(rewards).balance;
        vm.prank(keeper); // anyone
        executor.redirectToRewards(address(token));
        assertEq(executor.pendingETH(address(token)), 0);
        assertEq(address(rewards).balance - before, pending);
        assertApproxEqAbs(rewards.pendingReward(alice), address(rewards).balance, 1);
    }

    function test_redirect_onlyAfterGraduation() public {
        vm.expectRevert(BuybackExecutor.NotGraduated.selector);
        executor.redirectToRewards(address(token));
    }

    function test_pause_blocksBuybackOnly() public {
        vm.prank(multisig);
        executor.setPaused(true);
        vm.expectRevert(BuybackExecutor.IsPaused.selector);
        executor.buybackAndBurn(address(token), 0.01 ether, 1);
        executor.depositFor{value: 1}(address(token)); // deposits keep working
    }
}

contract HolderRewardsTest is BaseTest {
    function test_rewardsProRata() public {
        _stake(alice, 100e18);
        _stake(bob, 300e18);
        rewards.notifyReward{value: 4 ether}();
        assertEq(rewards.pendingReward(alice), 1 ether);
        assertEq(rewards.pendingReward(bob), 3 ether);

        vm.prank(alice);
        rewards.claim();
        assertEq(alice.balance, 1 ether);
    }

    function test_lateStakerGetsNoPastRewards() public {
        _stake(alice, 100e18);
        rewards.notifyReward{value: 1 ether}();
        _stake(bob, 100e18);
        assertEq(rewards.pendingReward(bob), 0);
        rewards.notifyReward{value: 2 ether}();
        assertEq(rewards.pendingReward(alice), 2 ether);
        assertEq(rewards.pendingReward(bob), 1 ether);
    }

    function test_unstakeKeepsEarnedRewards() public {
        _stake(alice, 100e18);
        rewards.notifyReward{value: 1 ether}();
        vm.startPrank(alice);
        rewards.unstake(100e18);
        assertEq(token.balanceOf(alice), 100e18);
        assertEq(rewards.pendingReward(alice), 1 ether);
        rewards.claim();
        vm.stopPrank();
        assertEq(alice.balance, 1 ether);
    }

    function test_unstakeTooMuch_reverts() public {
        _stake(alice, 1e18);
        vm.prank(alice);
        vm.expectRevert(HolderRewards.InsufficientStake.selector);
        rewards.unstake(2e18);
    }
}

contract TreasuryTest is BaseTest {
    function test_withdraw_timelocked() public {
        _payFee(10 ether);
        vault.distribute();
        uint256 bal = address(treasury).balance;

        vm.startPrank(multisig);
        uint256 id = treasury.queueWithdraw(bob, bal);
        vm.expectRevert(abi.encodeWithSelector(PlatformTreasury.TimelockActive.selector, block.timestamp + 48 hours));
        treasury.withdraw(id);
        vm.warp(block.timestamp + 48 hours);
        treasury.withdraw(id);
        vm.expectRevert(PlatformTreasury.NotQueued.selector);
        treasury.withdraw(id);
        vm.stopPrank();
        assertEq(bob.balance, bal);
    }

    function test_withdraw_onlyMultisig() public {
        vm.prank(alice);
        vm.expectRevert();
        treasury.queueWithdraw(alice, 1);
    }
}

contract LauncherMetadataTest is BaseTest {
    event TokenMetadata(address indexed token, PontoonLauncher.TokenMeta meta);

    function test_launch_emitsMetadata() public {
        vm.recordLogs();
        (address t,) = _launch(alice, FeeConfig(0, 0));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == TokenMetadata.selector) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), t);
                PontoonLauncher.TokenMeta memory m = abi.decode(logs[i].data, (PontoonLauncher.TokenMeta));
                assertEq(m.name, "Pontoon Test");
                assertEq(m.symbol, "PTT");
                assertEq(m.logo, "https://example.com/ptt.png");
                assertEq(m.twitter, "https://x.com/ptt");
                found = true;
            }
        }
        assertTrue(found);
    }
}

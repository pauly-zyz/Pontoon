// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
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
        assertEq(info.quoteAsset, address(0));
        assertFalse(info.graduated);
        assertEq(vault.admin(), creator);
        assertEq(vault.token(), address(token));
        assertEq(address(rewards.stakingToken()), address(token));
        assertEq(registry.tokenCount(), 1);
    }

    function test_launch_quotePairMustBeAllowed() public {
        address usdg = makeAddr("USDG");
        vm.prank(alice);
        vm.expectRevert(PontoonLauncher.QuotePairNotAllowed.selector);
        launcher.launch(_meta(), usdg, true, FeeConfig(0, 0));

        vm.prank(multisig);
        launcher.setQuotePair(usdg, true);
        vm.prank(alice);
        (address t,) = launcher.launch(_meta(), usdg, true, FeeConfig(0, 0));
        assertEq(registry.getToken(t).quoteAsset, usdg);
        assertTrue(registry.getToken(t).isMemestock);
        assertEq(pons.quoteAssetOf(t), usdg);
    }

    function test_launch_forwardsInitialBuy() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (address t,) = launcher.launch{value: 1 ether}(_meta(), address(0), false, FeeConfig(0, 0));
        assertEq(MockBalance(t).balanceOf(alice), 1 ether * pons.INITIAL_BUY_RATE());
    }

    function test_pause_blocksLaunch() public {
        vm.prank(multisig);
        launcher.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(PontoonLauncher.IsPaused.selector);
        launcher.launch(_meta(), address(0), false, FeeConfig(0, 0));
    }

    function test_registry_onlyLauncherRegisters() public {
        vm.expectRevert(TokenRegistry.NotLauncher.selector);
        registry.register(address(1), alice, address(0), false, address(2), address(3));
    }

    function test_registry_markGraduated() public {
        vm.expectRevert(TokenRegistry.NotGraduated.selector);
        registry.markGraduated(address(token));
        pons.setGraduated(address(token), true);
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
        vault.distribute(); // ~3.1984 ETH pending buyback
        curveRouter.setLiquidity(address(token), 100 ether); // cap = 1 ETH -> 0.5 ETH
        v4Router.setLiquidity(address(token), 20 ether); // cap = 0.2 ETH
    }

    function test_buyback_curveBeforeGraduation() public {
        assertEq(executor.maxBuyback(address(token)), 0.5 ether);
        vm.prank(keeper);
        uint256 burned = executor.buybackAndBurn(address(token), 0.5 ether, 1);
        assertEq(burned, 500e18);
        assertEq(token.balanceOf(DEAD), 500e18);
        assertEq(curveRouter.calls(), 1);
        assertEq(v4Router.calls(), 0);
        assertEq(executor.totalBurned(address(token)), 500e18);
    }

    function test_buyback_v4AfterGraduation() public {
        pons.setGraduated(address(token), true);
        assertEq(executor.maxBuyback(address(token)), 0.2 ether);
        executor.buybackAndBurn(address(token), 0.2 ether, 1);
        assertEq(v4Router.calls(), 1);
        assertEq(curveRouter.calls(), 0);
    }

    function test_buyback_requiresMinOut() public {
        vm.expectRevert(BuybackExecutor.ZeroMinOut.selector);
        executor.buybackAndBurn(address(token), 0.1 ether, 0);
    }

    function test_buyback_capped() public {
        vm.expectRevert(abi.encodeWithSelector(BuybackExecutor.ExceedsCap.selector, 0.5 ether));
        executor.buybackAndBurn(address(token), 0.5 ether + 1, 1);
    }

    function test_buyback_cannotSpendMoreThanPending() public {
        curveRouter.setLiquidity(address(token), 10_000 ether);
        uint256 pending = executor.pendingETH(address(token));
        for (uint256 i; i < 6; i++) {
            executor.buybackAndBurn(address(token), 0.5 ether, 1);
        }
        assertEq(executor.pendingETH(address(token)), pending - 3 ether);
        vm.expectRevert(BuybackExecutor.InsufficientPending.selector);
        executor.buybackAndBurn(address(token), 0.5 ether, 1);
    }

    function test_buyback_slippageReverts() public {
        vm.expectRevert("router: slippage");
        executor.buybackAndBurn(address(token), 0.1 ether, 101e18);
    }

    function test_pause_blocksBuybackOnly() public {
        vm.prank(multisig);
        executor.setPaused(true);
        vm.expectRevert(BuybackExecutor.IsPaused.selector);
        executor.buybackAndBurn(address(token), 0.1 ether, 1);
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

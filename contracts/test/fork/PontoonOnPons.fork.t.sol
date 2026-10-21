// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PontoonLauncher} from "../../src/PontoonLauncher.sol";
import {TokenRegistry} from "../../src/TokenRegistry.sol";
import {FeeVault} from "../../src/FeeVault.sol";
import {BuybackExecutor} from "../../src/BuybackExecutor.sol";
import {HolderRewards} from "../../src/HolderRewards.sol";
import {PlatformTreasury} from "../../src/PlatformTreasury.sol";
import {CTOManager} from "../../src/CTOManager.sol";
import {FeeConfig, ITokenRegistry} from "../../src/interfaces/IPontoon.sol";
import {IPonsV2Curve, IPonsV2LaunchFactory} from "../../src/interfaces/IPonsV2Live.sol";

/// @notice Full Pontoon flow against the REAL Pons V2 contracts on a Robinhood Chain mainnet fork:
///         launch + initial buy, trades, distribute (harvest + claim), buyback-and-burn on the curve,
///         staking rewards, creator claim, CTO, graduation and redirect of buyback ETH to stakers.
///   PONS_FORK_RPC=http://127.0.0.1:8546 forge test --match-path 'test/fork/*' -vv
contract PontoonOnPonsForkTest is Test {
    IPonsV2LaunchFactory constant PONS = IPonsV2LaunchFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    bool internal forked;
    address internal multisig = makeAddr("multisig");
    address internal creator = makeAddr("creator");
    address internal trader = makeAddr("trader");
    address internal staker = makeAddr("staker");
    address internal keeper = makeAddr("keeper");
    address internal newTeam = makeAddr("newTeam");

    TokenRegistry internal registry;
    PlatformTreasury internal treasury;
    BuybackExecutor internal executor;
    CTOManager internal cto;
    PontoonLauncher internal launcher;

    address internal token;
    FeeVault internal vault;
    IPonsV2Curve internal curve;
    HolderRewards internal rewards;

    function setUp() public {
        string memory rpc = vm.envOr("PONS_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;

        registry = new TokenRegistry(address(this));
        treasury = new PlatformTreasury(multisig);
        executor = new BuybackExecutor(multisig, registry);
        cto = new CTOManager(multisig, registry);
        launcher = new PontoonLauncher(
            multisig,
            PONS,
            registry,
            address(new FeeVault()),
            address(new HolderRewards()),
            address(executor),
            address(treasury),
            address(cto)
        );
        registry.setLauncher(address(launcher));
        registry.transferOwnership(multisig);

        vm.deal(creator, 2 ether);
        vm.deal(trader, 20 ether);
        vm.deal(staker, 5 ether);

        PontoonLauncher.TokenMeta memory meta = PontoonLauncher.TokenMeta({
            name: "Pontoon Fork",
            symbol: "PFORK",
            logo: "https://example.com/pfork.png",
            description: "Pontoon on the live Pons V2",
            twitter: "https://x.com/PontoonFamily",
            telegram: "",
            website: ""
        });
        uint256 fee = launcher.launchFee();
        vm.prank(creator);
        address v;
        (token, v) = launcher.launch{value: fee + 0.1 ether}(
            meta, address(0), false, FeeConfig({buybackBps: 4_000, rewardBps: 2_000}), 500
        );
        vault = FeeVault(payable(v));
        ITokenRegistry.TokenInfo memory info = registry.getToken(token);
        curve = IPonsV2Curve(info.curve);
        rewards = HolderRewards(payable(info.holderRewards));
    }

    /// @dev This test calls distribute() itself and receives the caller incentive.
    receive() external payable {}

    function _after() internal {
        vm.warp(block.timestamp + 10); // past the 3-second snipe tax
        vm.roll(block.number + 5);
    }

    /// @dev The real Pons accepts both ends of the creator's tax range (1% and 10%).
    function test_fork_creatorTaxRange() public {
        if (!forked) return;
        uint256 fee = launcher.launchFee();
        PontoonLauncher.TokenMeta memory meta;
        meta.name = "Tax Range";
        meta.symbol = "TAX";
        vm.startPrank(creator);
        (address lo,) = launcher.launch{value: fee}(meta, address(0), false, launcher.defaultFeeConfig(), 100);
        (address hi,) = launcher.launch{value: fee}(meta, address(0), false, launcher.defaultFeeConfig(), 1000);
        vm.stopPrank();
        assertEq(PONS.getLaunchedToken(lo).creatorTaxBps, 100);
        assertEq(PONS.getLaunchedToken(hi).creatorTaxBps, 1000);
    }

    function test_fork_launchWiresPons() public view {
        if (!forked) return;
        IPonsV2LaunchFactory.LaunchedToken memory l = PONS.getLaunchedToken(token);
        assertEq(l.curve, address(curve));
        assertEq(l.creatorFeeRecipient, address(vault), "FeeVault receives the creator fee");
        assertEq(l.creatorTaxBps, 500, "creator-chosen tax reaches Pons");
        assertFalse(l.buybackEnabled);
        assertEq(curve.token(), token);
        // Initial buy was in the launch tx and exempt from the snipe tax: ~5% of supply for 0.1 ETH.
        uint256 bal = IERC20(token).balanceOf(creator);
        console2.log("creator initial buy tokens", bal);
        assertGt(bal, 10_000_000e18, "initial buy not sniped");
    }

    function test_fork_fullFeeFlow() public {
        if (!forked) return;
        _after();

        // Trades on the real curve.
        vm.prank(trader);
        uint256 out = curve.buy{value: 1 ether}(1 ether, 1, trader);
        vm.startPrank(trader);
        IERC20(token).approve(address(curve), out / 3);
        curve.sell(out / 3, 1, trader);
        vm.stopPrank();

        // Stake before distribution.
        vm.prank(staker);
        uint256 sOut = curve.buy{value: 0.3 ether}(0.3 ether, 1, staker);
        vm.startPrank(staker);
        IERC20(token).approve(address(rewards), sOut);
        rewards.stake(sOut);
        vm.stopPrank();

        // distribute() pulls the fees out of Pons (harvest + FeeEscrow claim) and splits them.
        uint256 treasuryBefore = address(treasury).balance;
        vm.prank(keeper);
        vault.distribute();
        uint256 toTreasury = address(treasury).balance - treasuryBefore;
        uint256 buyback = executor.pendingETH(token);
        uint256 creatorOwed = vault.creatorOwed(creator);
        console2.log("platform fee (wei)", toTreasury);
        console2.log("buyback pending (wei)", buyback);
        console2.log("staker rewards (wei)", rewards.pendingReward(staker));
        console2.log("creator claimable (wei)", creatorOwed);
        assertGt(toTreasury, 0);
        assertGt(buyback, 0);
        assertGt(rewards.pendingReward(staker), 0);
        assertGt(creatorOwed, 0);
        assertEq(vault.claimableFromPons(), 0, "nothing left in the Pons escrow");

        // Buyback-and-burn on the curve.
        uint256 amount = buyback < executor.maxBuyback(token) ? buyback : executor.maxBuyback(token);
        vm.prank(keeper);
        uint256 burned = executor.buybackAndBurn(token, amount, 1);
        assertGt(burned, 0);
        assertEq(IERC20(token).balanceOf(DEAD), burned);

        // Claims.
        uint256 s0 = staker.balance;
        vm.prank(staker);
        rewards.claim();
        assertGt(staker.balance, s0);
        uint256 c0 = creator.balance;
        vm.prank(creator);
        vault.claimCreator();
        assertEq(creator.balance - c0, creatorOwed);
    }

    function test_fork_ctoMovesCreatorPayout() public {
        if (!forked) return;
        vm.prank(newTeam);
        cto.requestCTO(token, newTeam);
        vm.prank(multisig);
        cto.approveCTO(token);
        vm.warp(block.timestamp + 3 days + 1);
        cto.executeCTO(token);
        assertEq(vault.admin(), newTeam);
    }

    function test_fork_graduation_redirectsBuybackToStakers() public {
        if (!forked) return;
        _after();
        vm.prank(staker);
        uint256 sOut = curve.buy{value: 0.2 ether}(0.2 ether, 1, staker);
        vm.startPrank(staker);
        IERC20(token).approve(address(rewards), sOut);
        rewards.stake(sOut);
        vm.stopPrank();
        vault.distribute();
        uint256 pending = executor.pendingETH(token);
        assertGt(pending, 0);

        // Fill the curve: the real Pons migrates to Uniswap V4.
        vm.prank(trader);
        curve.buy{value: 6 ether}(6 ether, 1, trader);
        assertTrue(curve.graduated(), "graduated on the real curve");
        assertTrue(registry.isGraduated(token));
        registry.markGraduated(token);
        assertTrue(registry.getToken(token).graduated);

        assertEq(executor.maxBuyback(token), 0);
        vm.expectRevert(BuybackExecutor.Graduated.selector);
        executor.buybackAndBurn(token, pending, 1);

        uint256 before = rewards.pendingReward(staker);
        executor.redirectToRewards(token);
        assertEq(executor.pendingETH(token), 0);
        assertApproxEqAbs(rewards.pendingReward(staker) - before, pending, 1e6); // reward-per-share rounding

        // Post-graduation creator fees (MemeHook on V4) still reach the vault through distribute().
        vault.distribute();
    }
}

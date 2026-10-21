// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {FeeConfig} from "../src/interfaces/IPontoon.sol";

contract DistributeTest is BaseTest {
    event FeeDistributed(
        address indexed token, uint256 platform, uint256 creator, uint256 buyback, uint256 rewards, address caller
    );

    function test_vaultIsPonsCreatorFeeRecipient() public view {
        assertEq(pons.getLaunchedToken(address(token)).creatorFeeRecipient, address(vault));
        assertEq(pons.getLaunchedToken(address(token)).deployer, address(launcher));
        assertEq(vault.curve(), address(curve));
    }

    function test_feesWaitInPonsEscrowUntilDistribute() public {
        _payFee(1 ether);
        assertEq(vault.claimableFromPons(), 1 ether);
        assertEq(address(vault).balance, 0);
        vault.distribute();
        assertEq(vault.totalReceived(), 1 ether);
        assertEq(vault.claimableFromPons(), 0);
    }

    function test_distribute_harvestsCurveTradingFees() public {
        // 1 ETH buy: creator tax 3% (0.03) + 70% of the 1% curve fee (0.007) accrue in the curve.
        _buy(bob, 1 ether);
        assertEq(curve.pendingCreatorFees(), 0.037 ether);
        assertEq(vault.claimableFromPons(), 0, "not swept yet");
        vm.prank(keeper);
        vault.distribute();
        assertEq(curve.pendingCreatorFees(), 0, "swept by the Pons harvester");
        assertEq(vault.totalReceived(), 0.037 ether);
        assertEq(vault.totalDistributed(), 0.037 ether);
    }

    function test_collectFees_isPermissionlessAndNeverReverts() public {
        vm.prank(alice);
        assertEq(vault.collectFees(), 0); // nothing anywhere: no revert
        _buy(bob, 0.5 ether);
        vm.prank(alice);
        uint256 claimed = vault.collectFees();
        assertEq(claimed, 0.0185 ether);
        assertEq(vault.pendingDistribution(), 0.0185 ether);
    }

    function test_distribute_defaultSplit_incentiveCapped() public {
        _payFee(10 ether);
        _stake(alice, 100e18);

        // incentive = min(0.5% * 10, 0.005) = 0.005
        // rest = 9.995; platform 20% = 1.999; remainder = 7.996
        // buyback 40% = 3.1984; rewards 20% = 1.5992; creator = 3.1984
        vm.expectEmit(address(vault));
        emit FeeDistributed(address(token), 1.999 ether, 3.1984 ether, 3.1984 ether, 1.5992 ether, keeper);
        vm.prank(keeper);
        vault.distribute();

        assertEq(keeper.balance, 0.005 ether, "incentive");
        assertEq(address(treasury).balance, 1.999 ether, "platform");
        assertEq(executor.pendingETH(address(token)), 3.1984 ether, "buyback");
        assertEq(address(executor).balance, 3.1984 ether);
        assertEq(address(rewards).balance, 1.5992 ether, "rewards");
        assertEq(vault.creatorOwed(creator), 3.1984 ether, "creator owed");
        assertEq(address(vault).balance, 3.1984 ether, "only creator payout stays");
        assertEq(vault.pendingDistribution(), 0);
    }

    function test_distribute_smallAmount_incentiveIsHalfPercent() public {
        _payFee(0.1 ether);
        vm.prank(keeper);
        vault.distribute();
        assertEq(keeper.balance, 0.0005 ether);
        assertEq(address(treasury).balance, 0.0199 ether);
        assertEq(executor.pendingETH(address(token)), 0.03184 ether);
        assertEq(vault.creatorOwed(creator), 0.03184 ether);
    }

    function test_distribute_revertsWhenEmpty() public {
        vm.expectRevert(FeeVault.NothingToDistribute.selector);
        vault.distribute();
    }

    function test_distribute_doesNotRedistributeUnclaimedCreatorPayout() public {
        _payFee(1 ether);
        vault.distribute();
        uint256 owed = vault.creatorOwed(creator);
        assertGt(owed, 0);
        vm.expectRevert(FeeVault.NothingToDistribute.selector);
        vault.distribute();

        _payFee(1 ether);
        vault.distribute();
        assertEq(vault.creatorOwed(creator), owed * 2);
        assertEq(address(vault).balance, owed * 2);
    }

    function test_claimCreator_pull() public {
        _payFee(1 ether);
        vault.distribute();
        uint256 owed = vault.creatorOwed(creator);

        vm.prank(creator);
        vault.claimCreator();
        assertEq(creator.balance, owed);
        assertEq(vault.creatorOwed(creator), 0);
        assertEq(vault.totalCreatorOwed(), 0);

        vm.prank(creator);
        vm.expectRevert(FeeVault.NothingToClaim.selector);
        vault.claimCreator();
    }

    function test_strangerCannotClaimCreatorPayout() public {
        _payFee(1 ether);
        vault.distribute();
        vm.prank(alice);
        vm.expectRevert(FeeVault.NothingToClaim.selector);
        vault.claimCreator();
    }

    function test_rewardsQueuedWithoutStakers_thenReleased() public {
        _payFee(1 ether);
        vault.distribute(); // nobody staked
        uint256 queued = rewards.queuedRewards();
        assertGt(queued, 0);

        _stake(alice, 50e18);
        _payFee(1 ether);
        vault.distribute();
        assertEq(rewards.queuedRewards(), 0);
        // alice gets everything (queued + new), minus rounding dust
        assertApproxEqAbs(rewards.pendingReward(alice), address(rewards).balance, 1);
    }

    function test_distribute_worksWhilePaused() public {
        vm.startPrank(multisig);
        launcher.setPaused(true);
        executor.setPaused(true);
        vm.stopPrank();
        _payFee(1 ether);
        vault.distribute();
        assertGt(executor.pendingETH(address(token)), 0);
    }

    function test_distribute_respectsPlatformFeeChange() public {
        vm.prank(multisig);
        launcher.setPlatformFeeBps(0);
        _payFee(1 ether);
        vault.distribute();
        assertEq(address(treasury).balance, 0);
    }

    function test_distribute_zeroBuybackZeroReward() public {
        (address t, address v) = _launch(alice, FeeConfig({buybackBps: 0, rewardBps: 0}));
        vm.deal(address(this), 1 ether);
        pons.creditCreatorFee{value: 1 ether}(t);
        FeeVault(payable(v)).distribute();
        assertEq(executor.pendingETH(t), 0);
        // 1 - 0.005 incentive = 0.995; 80% to creator
        assertEq(FeeVault(payable(v)).creatorOwed(alice), 0.796 ether);
    }

    /// @dev Every wei is accounted for and the caller never gets more than the cap.
    function testFuzz_distribute_conservesValue(uint96 amount, uint16 buybackBps, uint16 rewardBps, uint16 platformBps)
        public
    {
        amount = uint96(bound(amount, 1, 1_000_000 ether));
        buybackBps = uint16(bound(buybackBps, 0, 8_000));
        rewardBps = uint16(bound(rewardBps, 0, 10_000 - buybackBps > 5_000 ? 5_000 : 10_000 - buybackBps));
        platformBps = uint16(bound(platformBps, 0, 3_000));

        vm.prank(multisig);
        launcher.setPlatformFeeBps(platformBps);
        (address t, address v) = _launch(alice, FeeConfig({buybackBps: buybackBps, rewardBps: rewardBps}));
        FeeVault fv = FeeVault(payable(v));

        vm.deal(address(this), amount);
        pons.creditCreatorFee{value: amount}(t);

        uint256 treasuryBefore = address(treasury).balance;
        address rw = registry.getToken(t).holderRewards;
        vm.prank(keeper);
        fv.distribute();

        uint256 incentive = keeper.balance;
        assertLe(incentive, 0.005 ether);
        assertLe(incentive, uint256(amount) * 50 / 10_000);
        uint256 sum = incentive + (address(treasury).balance - treasuryBefore) + executor.pendingETH(t)
            + address(rw).balance + fv.creatorOwed(alice);
        assertEq(sum, amount);
        assertEq(address(fv).balance, fv.creatorOwed(alice));
    }
}

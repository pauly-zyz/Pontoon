// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";

/// @notice Behaviours documented in SECURITY_REVIEW.md, kept as tests so the report stays accurate.
contract ReviewFindingsTest is BaseTest {
    /// M-1: a late staker can stake, trigger distribute() and unstake in one block and take a share
    ///      of rewards that built up while only long-term stakers were staked.
    function test_M1_justInTimeStakingCapturesRewards() public {
        _stake(alice, 1_000e18); // long-term staker
        _payFee(1 ether); // fees accrued over time

        // Bob arrives with 9x Alice's stake, distributes, then leaves in the same block.
        _stake(bob, 9_000e18);
        vault.distribute();
        vm.startPrank(bob);
        rewards.unstake(9_000e18);
        uint256 bobGot = rewards.claim();
        vm.stopPrank();

        uint256 aliceGets = rewards.pendingReward(alice);
        assertApproxEqRel(bobGot, 9 * aliceGets, 1e15, "late staker takes 90% of the rewards");
        assertEq(token.balanceOf(bob), 9_000e18, "and keeps all of his tokens");
    }

    /// M-2: the CTO timelock runs from the request, not from the multisig approval, so a request
    ///      approved more than 3 days after it was made can be executed in the same block.
    function test_M2_ctoExecutableRightAfterLateApproval() public {
        vm.prank(alice);
        cto.requestCTO(address(token), ctoTeam);
        vm.warp(block.timestamp + 4 days);

        vm.prank(multisig);
        cto.approveCTO(address(token));
        cto.executeCTO(address(token)); // same block as the approval
        assertEq(vault.admin(), ctoTeam);
    }

    /// L-2: anyone can hold the single CTO slot of a token with a request nobody approves.
    function test_L2_ctoRequestSlotCanBeHeld() public {
        vm.prank(bob);
        cto.requestCTO(address(token), bob);
        vm.prank(alice);
        vm.expectRevert(); // RequestPending
        cto.requestCTO(address(token), ctoTeam);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {CTOManager} from "../src/CTOManager.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {FeeConfig} from "../src/interfaces/IPontoon.sol";

contract CTOTest is BaseTest {
    event CTORequested(address indexed token, address indexed newAdmin, uint256 eta);
    event CTOExecuted(address indexed token, address indexed oldAdmin, address indexed newAdmin);
    event CTOCancelled(address indexed token);

    function _requestAndApprove() internal returns (uint256 eta) {
        vm.prank(alice);
        eta = cto.requestCTO(address(token), ctoTeam);
        vm.prank(multisig);
        cto.approveCTO(address(token));
    }

    function test_request_emitsThreeDayEta() public {
        vm.expectEmit(address(cto));
        emit CTORequested(address(token), ctoTeam, block.timestamp + 3 days);
        vm.prank(alice);
        cto.requestCTO(address(token), ctoTeam);
    }

    function test_request_unregisteredToken_reverts() public {
        vm.expectRevert(CTOManager.NotRegistered.selector);
        cto.requestCTO(address(0xBEEF), ctoTeam);
    }

    function test_request_duplicate_reverts() public {
        vm.prank(alice);
        cto.requestCTO(address(token), ctoTeam);
        vm.prank(bob);
        vm.expectRevert(CTOManager.RequestPending.selector);
        cto.requestCTO(address(token), bob);
    }

    function test_request_sameAdmin_reverts() public {
        vm.expectRevert(CTOManager.SameAdmin.selector);
        cto.requestCTO(address(token), creator);
    }

    function test_approve_onlyMultisig() public {
        vm.prank(alice);
        cto.requestCTO(address(token), ctoTeam);
        vm.prank(alice);
        vm.expectRevert();
        cto.approveCTO(address(token));
    }

    function test_execute_withoutApproval_reverts() public {
        vm.prank(alice);
        cto.requestCTO(address(token), ctoTeam);
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(CTOManager.NotApproved.selector);
        cto.executeCTO(address(token));
    }

    function test_execute_beforeTimelock_reverts() public {
        uint256 eta = _requestAndApprove();
        vm.warp(eta - 1);
        vm.expectRevert(abi.encodeWithSelector(CTOManager.TimelockActive.selector, eta));
        cto.executeCTO(address(token));
    }

    function test_execute_movesAdmin() public {
        uint256 eta = _requestAndApprove();
        vm.warp(eta);
        vm.expectEmit(address(cto));
        emit CTOExecuted(address(token), creator, ctoTeam);
        vm.prank(bob); // anyone can execute
        cto.executeCTO(address(token));

        assertEq(vault.admin(), ctoTeam);
        (address pendingAdmin,,,) = cto.requests(address(token));
        assertEq(pendingAdmin, address(0));

        // New admin controls config; old admin does not.
        vm.prank(creator);
        vm.expectRevert(FeeVault.NotAdmin.selector);
        vault.queueConfig(FeeConfig({buybackBps: 0, rewardBps: 0}));
        vm.prank(ctoTeam);
        vault.queueConfig(FeeConfig({buybackBps: 8_000, rewardBps: 0}));
    }

    function test_execute_preservesEarnedPayouts() public {
        _payFee(1 ether);
        vault.distribute();
        uint256 oldOwed = vault.creatorOwed(creator);

        uint256 eta = _requestAndApprove();
        vm.warp(eta);
        cto.executeCTO(address(token));

        _payFee(1 ether);
        vault.distribute();
        assertEq(vault.creatorOwed(creator), oldOwed, "old creator keeps earned payout");
        assertGt(vault.creatorOwed(ctoTeam), 0, "new admin earns from now on");

        vm.prank(creator);
        vault.claimCreator();
        assertEq(creator.balance, oldOwed);
    }

    function test_execute_dropsConfigQueuedByOldAdmin() public {
        vm.prank(creator);
        vault.queueConfig(FeeConfig({buybackBps: 0, rewardBps: 0}));
        uint256 eta = _requestAndApprove();
        vm.warp(eta);
        cto.executeCTO(address(token));
        assertEq(vault.pendingConfigEta(), 0);
        vm.expectRevert(FeeVault.NothingQueued.selector);
        vault.applyConfig();
    }

    function test_cancel_byCurrentAdmin() public {
        _requestAndApprove();
        vm.expectEmit(address(cto));
        emit CTOCancelled(address(token));
        vm.prank(creator);
        cto.cancelCTO(address(token));
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(CTOManager.NoRequest.selector);
        cto.executeCTO(address(token));
    }

    function test_cancel_byMultisigAndRequester() public {
        vm.prank(alice);
        cto.requestCTO(address(token), ctoTeam);
        vm.prank(alice);
        cto.cancelCTO(address(token));

        vm.prank(bob);
        cto.requestCTO(address(token), ctoTeam);
        vm.prank(multisig);
        cto.cancelCTO(address(token));
    }

    function test_cancel_byStranger_reverts() public {
        vm.prank(alice);
        cto.requestCTO(address(token), ctoTeam);
        vm.prank(bob);
        vm.expectRevert(CTOManager.NotAuthorized.selector);
        cto.cancelCTO(address(token));
    }

    function test_setAdmin_onlyCTOManager() public {
        vm.prank(multisig);
        vm.expectRevert(FeeVault.NotCTOManager.selector);
        vault.setAdmin(ctoTeam);
    }

    function test_newRequestAllowedAfterExecute() public {
        uint256 eta = _requestAndApprove();
        vm.warp(eta);
        cto.executeCTO(address(token));
        vm.prank(alice);
        cto.requestCTO(address(token), bob);
    }
}

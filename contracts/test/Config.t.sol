// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {PontoonLauncher} from "../src/PontoonLauncher.sol";
import {FeeConfig} from "../src/interfaces/IPontoon.sol";

/// @notice Config bounds (buyback <= 80%, reward <= 50%) and the 24h timelock.
contract ConfigBoundsTest is BaseTest {
    function _cfg(uint16 b, uint16 r) internal pure returns (FeeConfig memory) {
        return FeeConfig({buybackBps: b, rewardBps: r});
    }

    function test_defaultConfig() public {
        vm.prank(alice);
        (, address v) = launcher.launchWithDefaultConfig(_meta(), address(0), false);
        (uint16 b, uint16 r) = FeeVault(payable(v)).config();
        assertEq(b, 4_000);
        assertEq(r, 2_000);
    }

    function test_launch_atMaxBounds() public {
        (, address v) = _launch(alice, _cfg(8_000, 2_000));
        (uint16 b, uint16 r) = FeeVault(payable(v)).config();
        assertEq(b, 8_000);
        assertEq(r, 2_000);
        _launch(bob, _cfg(5_000, 5_000));
    }

    function test_launch_revertsBuybackAbove80() public {
        vm.prank(alice);
        vm.expectRevert(FeeVault.InvalidConfig.selector);
        launcher.launch(_meta(), address(0), false, _cfg(8_001, 0));
    }

    function test_launch_revertsRewardAbove50() public {
        vm.prank(alice);
        vm.expectRevert(FeeVault.InvalidConfig.selector);
        launcher.launch(_meta(), address(0), false, _cfg(0, 5_001));
    }

    function test_launch_revertsSumAbove100() public {
        vm.prank(alice);
        vm.expectRevert(FeeVault.InvalidConfig.selector);
        launcher.launch(_meta(), address(0), false, _cfg(8_000, 2_001));
    }

    function test_queue_revertsOutOfBounds() public {
        vm.startPrank(creator);
        vm.expectRevert(FeeVault.InvalidConfig.selector);
        vault.queueConfig(_cfg(8_001, 0));
        vm.expectRevert(FeeVault.InvalidConfig.selector);
        vault.queueConfig(_cfg(0, 5_001));
        vm.expectRevert(FeeVault.InvalidConfig.selector);
        vault.queueConfig(_cfg(6_000, 4_001));
        vm.stopPrank();
    }

    function testFuzz_validateConfig(uint16 b, uint16 r) public view {
        bool ok = b <= 8_000 && r <= 5_000 && uint256(b) + r <= 10_000;
        if (ok) {
            vault.validateConfig(_cfg(b, r));
        } else {
            try vault.validateConfig(_cfg(b, r)) {
                revert("should have reverted");
            } catch (bytes memory err) {
                assertEq(bytes4(err), FeeVault.InvalidConfig.selector);
            }
        }
    }

    function test_platformFee_capped() public {
        vm.startPrank(multisig);
        launcher.setPlatformFeeBps(3_000);
        vm.expectRevert(PontoonLauncher.FeeTooHigh.selector);
        launcher.setPlatformFeeBps(3_001);
        vm.stopPrank();
    }

    function test_platformFee_onlyOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        launcher.setPlatformFeeBps(1_000);
    }

    function test_vaultCannotBeReinitialized() public {
        vm.expectRevert(FeeVault.AlreadyInitialized.selector);
        vault.initialize(address(1), alice, address(1), address(1), address(1), address(1), _cfg(0, 0));
    }

    function test_implementationIsLocked() public {
        FeeVault impl = FeeVault(payable(launcher.feeVaultImpl()));
        vm.expectRevert(FeeVault.AlreadyInitialized.selector);
        impl.initialize(address(1), alice, address(1), address(1), address(1), address(1), _cfg(0, 0));
    }
}

contract ConfigTimelockTest is BaseTest {
    event ConfigQueued(address indexed token, FeeConfig newConfig, uint256 eta);
    event ConfigApplied(address indexed token, FeeConfig newConfig);

    function _cfg(uint16 b, uint16 r) internal pure returns (FeeConfig memory) {
        return FeeConfig({buybackBps: b, rewardBps: r});
    }

    function test_onlyAdminCanQueue() public {
        vm.prank(alice);
        vm.expectRevert(FeeVault.NotAdmin.selector);
        vault.queueConfig(_cfg(1_000, 1_000));
    }

    function test_queue_emitsEta() public {
        vm.expectEmit(address(vault));
        emit ConfigQueued(address(token), _cfg(1_000, 1_000), block.timestamp + 24 hours);
        vm.prank(creator);
        vault.queueConfig(_cfg(1_000, 1_000));
        assertEq(vault.pendingConfigEta(), block.timestamp + 24 hours);
    }

    function test_applyBeforeEta_reverts() public {
        vm.prank(creator);
        vault.queueConfig(_cfg(1_000, 1_000));
        uint256 eta = vault.pendingConfigEta();

        vm.warp(eta - 1);
        vm.expectRevert(abi.encodeWithSelector(FeeVault.TimelockActive.selector, eta));
        vault.applyConfig();

        (uint16 b,) = vault.config();
        assertEq(b, 4_000, "active config unchanged");
    }

    function test_applyAfterEta_byAnyone() public {
        vm.prank(creator);
        vault.queueConfig(_cfg(1_000, 3_000));
        vm.warp(block.timestamp + 24 hours);

        vm.expectEmit(address(vault));
        emit ConfigApplied(address(token), _cfg(1_000, 3_000));
        vm.prank(alice);
        vault.applyConfig();

        (uint16 b, uint16 r) = vault.config();
        assertEq(b, 1_000);
        assertEq(r, 3_000);
        assertEq(vault.pendingConfigEta(), 0);
    }

    function test_feesBeforeApplyUseOldConfig() public {
        vm.prank(creator);
        vault.queueConfig(_cfg(0, 0)); // creator wants 100% of the remainder
        _payFee(1 ether);
        vault.distribute();
        assertGt(executor.pendingETH(address(token)), 0, "old 40% buyback still applies");
    }

    function test_applyWithoutQueue_reverts() public {
        vm.expectRevert(FeeVault.NothingQueued.selector);
        vault.applyConfig();
    }

    function test_requeueResetsTimelock() public {
        vm.prank(creator);
        vault.queueConfig(_cfg(1_000, 1_000));
        vm.warp(block.timestamp + 23 hours);
        vm.prank(creator);
        vault.queueConfig(_cfg(2_000, 2_000));
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert();
        vault.applyConfig();
        vm.warp(block.timestamp + 22 hours);
        vault.applyConfig();
        (uint16 b,) = vault.config();
        assertEq(b, 2_000);
    }

    function test_cancel() public {
        vm.prank(creator);
        vault.queueConfig(_cfg(1_000, 1_000));
        vm.prank(alice);
        vm.expectRevert(FeeVault.NotAdmin.selector);
        vault.cancelConfig();
        vm.prank(creator);
        vault.cancelConfig();
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(FeeVault.NothingQueued.selector);
        vault.applyConfig();
    }

    function testFuzz_timelock(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 30 days);
        vm.prank(creator);
        vault.queueConfig(_cfg(1_000, 1_000));
        vm.warp(block.timestamp + elapsed);
        if (elapsed < 24 hours) {
            vm.expectRevert();
            vault.applyConfig();
        } else {
            vault.applyConfig();
        }
    }
}

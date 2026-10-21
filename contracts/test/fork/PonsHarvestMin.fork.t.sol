// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IPonsV2LaunchFactory, IPonsV2Curve, PonsV2Raw} from "../../src/interfaces/IPonsV2Live.sol";

/// @dev Measures the smallest amount of accrued creator fees the Pons fee harvester will sweep.
contract PonsHarvestMinForkTest is Test {
    IPonsV2LaunchFactory constant PONS = IPonsV2LaunchFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);

    function test_harvestMinimum() public {
        string memory rpc = vm.envOr("PONS_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        IPonsV2LaunchFactory.TokenParams memory p;
        p.name = "Min";
        p.symbol = "MIN";
        p.creatorFeeRecipient = address(0xBEEF);
        p.creatorTaxBps = 300;
        p.expectedEconomics = PONS.previewLaunchEconomics(0, address(0));
        p.salt = keccak256("min");
        (, address curve) = PONS.launchToken{value: PONS.launchFee()}(p, 0, address(0));
        vm.warp(block.timestamp + 10);
        address h = PonsV2Raw.feeHarvester(PONS.memeHook());
        uint256 lo = 0.01 ether;
        uint256 hi = 0.25 ether;
        for (uint256 i; i < 20; i++) {
            uint256 mid = (lo + hi) / 2;
            uint256 snap = vm.snapshotState();
            vm.deal(address(this), mid);
            IPonsV2Curve(curve).buy{value: mid}(mid, 1, address(this));
            (bool ok,) = h.call(abi.encodeWithSelector(PonsV2Raw.HARVESTER_HARVEST, curve));
            vm.revertToState(snap);
            if (ok) hi = mid;
            else lo = mid;
        }
        console2.log("smallest buy that can be harvested (wei)", hi);
        console2.log("creator fee accrued at that point (wei)", hi * 370 / 10_000);
        console2.log("total fee in curve (wei)", hi * 400 / 10_000);
    }
}

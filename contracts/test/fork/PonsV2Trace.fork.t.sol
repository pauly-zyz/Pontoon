// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IPonsV2LaunchFactory, IPonsV2FeeEscrow, IPonsV2Curve} from "../../src/interfaces/IPonsV2Live.sol";

contract Sink {
    receive() external payable {}
}

/// @dev Diagnostic: how do curve fees reach the creator? Skipped without PONS_FORK_RPC.
contract PonsV2TraceForkTest is Test {
    IPonsV2LaunchFactory constant FACTORY = IPonsV2LaunchFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    address constant HARVESTER = 0xa1018c1D9655292A2dE0F7dEa9a0F848EaA8cA83;

    Sink internal rcpt;
    address internal curve;
    IPonsV2FeeEscrow internal escrow;

    function _launchAndBuy() internal {
        rcpt = new Sink();
        IPonsV2LaunchFactory.TokenParams memory p;
        p.name = "Trace";
        p.symbol = "TRC";
        p.creatorFeeRecipient = address(rcpt);
        p.creatorTaxBps = 300;
        p.expectedEconomics = FACTORY.previewLaunchEconomics(0, address(0));
        p.salt = keccak256("trace");
        (, curve) = FACTORY.launchToken{value: FACTORY.launchFee()}(p, 0, address(0));
        escrow = IPonsV2FeeEscrow(FACTORY.feeEscrow());

        vm.warp(block.timestamp + 10); // past the 3-second snipe-tax window
        vm.roll(block.number + 5);
        address trader = makeAddr("trader");
        vm.deal(trader, 1 ether);
        vm.prank(trader);
        IPonsV2Curve(curve).buy{value: 0.5 ether}(0.5 ether, 1, trader);
        console2.log("escrow credit after buy", escrow.balanceOf(address(rcpt)));
    }

    function test_trace_buy_then_harvest() public {
        string memory rpc = vm.envOr("PONS_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        _launchAndBuy();

        address caller = makeAddr("random");
        uint256 before = caller.balance;
        vm.prank(caller);
        (bool ok, bytes memory ret) = HARVESTER.call(abi.encodeWithSelector(bytes4(0xe6b71b11), curve));
        console2.log("harvest by random caller ok", ok);
        if (!ok) console2.logBytes(ret);
        console2.log("caller reward (wei)", caller.balance - before);

        uint256 credited = escrow.balanceOf(address(rcpt));
        console2.log("escrow credit after harvest", credited);
        if (credited > 0) {
            vm.prank(address(rcpt));
            escrow.claim();
            console2.log("recipient ETH after claim", address(rcpt).balance);
        }
    }
}

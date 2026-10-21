// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPonsV2LaunchFactory, IPonsV2Curve} from "../../src/interfaces/IPonsV2Live.sol";

/// @dev Mimics PontoonLauncher: launch exempting itself from snipe tax, then buy for the creator.
contract LaunchAndBuyProbe {
    IPonsV2LaunchFactory constant FACTORY = IPonsV2LaunchFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);

    function go(bool exempt) external payable returns (uint256 tokensOut, uint256 creatorTax) {
        IPonsV2LaunchFactory.TokenParams memory p;
        p.name = "Probe";
        p.symbol = "PRB";
        p.creatorFeeRecipient = address(this);
        p.creatorTaxBps = 300;
        p.expectedEconomics = FACTORY.previewLaunchEconomics(0, address(0));
        p.salt = keccak256(abi.encode(exempt, block.timestamp));
        uint256 fee = FACTORY.launchFee();
        address[] memory ex = new address[](exempt ? 2 : 0);
        if (exempt) {
            ex[0] = address(this);
            ex[1] = msg.sender; // the buyer's recipient
        }
        (address token, address curve) = FACTORY.launchToken{value: fee}(p, 0, address(0), ex);
        uint256 buy = msg.value - fee;
        tokensOut = IPonsV2Curve(curve).buy{value: buy}(buy, 1, msg.sender);
        require(IERC20(token).balanceOf(msg.sender) == tokensOut, "tokens not delivered");
        creatorTax = curve.balance; // fees stay in the curve until harvested
    }

    receive() external payable {}
}

contract PonsV2LaunchBuyForkTest is Test {
    function test_initialBuy_withAndWithoutSnipeExemption() public {
        string memory rpc = vm.envOr("PONS_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        address creator = makeAddr("creator");
        vm.deal(creator, 2 ether);

        LaunchAndBuyProbe a = new LaunchAndBuyProbe();
        vm.prank(creator);
        (uint256 outExempt,) = a.go{value: 0.1005 ether}(true);
        LaunchAndBuyProbe b = new LaunchAndBuyProbe();
        vm.prank(creator);
        (uint256 outTaxed,) = b.go{value: 0.1005 ether}(false);
        console2.log("tokens for 0.1 ETH, exempt  ", outExempt);
        console2.log("tokens for 0.1 ETH, no exemption", outTaxed);
        assertGt(outExempt, outTaxed * 10, "exemption avoids the snipe tax");
    }
}

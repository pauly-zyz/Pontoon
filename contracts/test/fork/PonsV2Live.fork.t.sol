// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPonsV2LaunchFactory, IPonsV2FeeEscrow, IPonsV2Curve, PonsV2Raw} from "../../src/interfaces/IPonsV2Live.sol";

/// @dev A contract fee recipient, standing in for a Pontoon FeeVault.
contract ContractRecipient {
    receive() external payable {}

    function claim(IPonsV2FeeEscrow escrow) external returns (uint256) {
        return escrow.claim();
    }
}

/// @notice Runs against a fork of Robinhood Chain mainnet. Skipped unless PONS_FORK_RPC is set:
///   PONS_FORK_RPC=https://rpc.mainnet.chain.robinhood.com forge test --match-path 'test/fork/*' -vv
contract PonsV2LiveForkTest is Test {
    IPonsV2LaunchFactory constant FACTORY = IPonsV2LaunchFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);

    bool internal forked;
    address internal creator = makeAddr("creator");
    address internal trader = makeAddr("trader");

    function setUp() public {
        string memory rpc = vm.envOr("PONS_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;
        vm.deal(creator, 1 ether);
        vm.deal(trader, 10 ether);
    }

    function _params(address feeRecipient) internal view returns (IPonsV2LaunchFactory.TokenParams memory p) {
        p.name = "Pontoon Fork Test";
        p.symbol = "PFT";
        p.logo = "";
        p.description = "fork test";
        p.creatorFeeRecipient = feeRecipient;
        p.creatorTaxBps = 300;
        p.buybackEnabled = false;
        p.expectedEconomics = FACTORY.previewLaunchEconomics(0, address(0));
        p.salt = keccak256(abi.encode(block.timestamp, feeRecipient));
    }

    function test_launch_buy_and_contractClaimsCreatorFees() public {
        if (!forked) return;
        ContractRecipient recipient = new ContractRecipient();
        IPonsV2FeeEscrow escrow = IPonsV2FeeEscrow(FACTORY.feeEscrow());

        uint256 fee = FACTORY.launchFee();
        IPonsV2LaunchFactory.TokenParams memory params = _params(address(recipient)); // before prank: makes calls
        vm.prank(creator);
        (address token, address curve) = FACTORY.launchToken{value: fee}(params, 0, address(0));
        console2.log("token", token);
        console2.log("curve", curve);

        IPonsV2LaunchFactory.LaunchedToken memory info = FACTORY.getLaunchedToken(token);
        assertEq(info.creatorFeeRecipient, address(recipient), "fee recipient is the contract");
        assertEq(info.deployer, creator);
        assertEq(info.creatorTaxBps, 300);

        // Trader buys 0.5 ETH on the curve, after the 3-second launch snipe tax.
        vm.warp(block.timestamp + 10);
        vm.roll(block.number + 5);
        vm.prank(trader);
        uint256 out = IPonsV2Curve(curve).buy{value: 0.5 ether}(0.5 ether, 1, trader);
        assertGt(out, 0);
        assertEq(IERC20(token).balanceOf(trader), out);
        console2.log("tokens out", out);

        // Fees wait in the curve until anyone calls the Pons fee harvester.
        PonsV2Raw.harvest(PonsV2Raw.feeHarvester(FACTORY.memeHook()), curve);
        uint256 credited = escrow.balanceOf(address(recipient));
        console2.log("creator fee credited to contract (wei)", credited);
        assertGt(credited, 0, "creator fee accrues in FeeEscrow");

        uint256 claimed = recipient.claim(escrow);
        assertEq(claimed, credited);
        assertEq(address(recipient).balance, credited, "contract received ETH from FeeEscrow");

        // Sell half back.
        vm.startPrank(trader);
        IERC20(token).approve(curve, out / 2);
        uint256 ethBack = IPonsV2Curve(curve).sell(out / 2, 1, trader);
        vm.stopPrank();
        assertGt(ethBack, 0);
        console2.log("eth back from sell", ethBack);
        console2.log("realQuoteReserve", IPonsV2Curve(curve).realQuoteReserve());
        console2.log("graduationThreshold", IPonsV2Curve(curve).graduationThreshold());
        PonsV2Raw.harvest(PonsV2Raw.feeHarvester(FACTORY.memeHook()), curve);
        assertGt(escrow.balanceOf(address(recipient)), 0, "sell also credits creator fee");
    }
}

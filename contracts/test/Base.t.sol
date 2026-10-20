// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PontoonLauncher} from "../src/PontoonLauncher.sol";
import {TokenRegistry} from "../src/TokenRegistry.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {BuybackExecutor} from "../src/BuybackExecutor.sol";
import {HolderRewards} from "../src/HolderRewards.sol";
import {PlatformTreasury} from "../src/PlatformTreasury.sol";
import {CTOManager} from "../src/CTOManager.sol";
import {FeeConfig} from "../src/interfaces/IPontoon.sol";
import {MockPonsFactory, MockRouter, MockToken} from "./mocks/MockPons.sol";

abstract contract BaseTest is Test {
    address internal multisig = makeAddr("multisig");
    address internal creator = makeAddr("creator");
    address internal keeper = makeAddr("keeper");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal ctoTeam = makeAddr("ctoTeam");

    MockPonsFactory internal pons;
    MockRouter internal curveRouter;
    MockRouter internal v4Router;

    TokenRegistry internal registry;
    PlatformTreasury internal treasury;
    BuybackExecutor internal executor;
    CTOManager internal cto;
    PontoonLauncher internal launcher;

    MockToken internal token;
    FeeVault internal vault;
    HolderRewards internal rewards;

    function setUp() public virtual {
        pons = new MockPonsFactory();
        curveRouter = new MockRouter();
        v4Router = new MockRouter();

        registry = new TokenRegistry(multisig, pons);
        treasury = new PlatformTreasury(multisig);
        executor = new BuybackExecutor(multisig, registry, pons, curveRouter, v4Router);
        cto = new CTOManager(multisig, registry);
        launcher = new PontoonLauncher(
            multisig,
            pons,
            registry,
            address(new FeeVault()),
            address(new HolderRewards()),
            address(executor),
            address(treasury),
            address(cto)
        );
        vm.prank(multisig);
        registry.setLauncher(address(launcher));

        (address t, address v) = _launch(creator, FeeConfig({buybackBps: 4_000, rewardBps: 2_000}));
        token = MockToken(t);
        vault = FeeVault(payable(v));
        rewards = HolderRewards(payable(registry.getToken(t).holderRewards));
    }

    /// @dev Test contract calls distribute() and must accept the caller incentive.
    receive() external payable {}

    function _meta() internal pure returns (PontoonLauncher.TokenMeta memory) {
        return PontoonLauncher.TokenMeta({name: "Pontoon Test", symbol: "PTT", metadataURI: "ipfs://meta"});
    }

    function _launch(address who, FeeConfig memory cfg) internal returns (address t, address v) {
        vm.prank(who);
        (t, v) = launcher.launch(_meta(), address(0), false, cfg);
    }

    function _payFee(uint256 amount) internal {
        vm.deal(address(this), amount);
        pons.payCreatorFee{value: amount}(address(token));
    }

    function _stake(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(rewards), amount);
        rewards.stake(amount);
        vm.stopPrank();
    }
}

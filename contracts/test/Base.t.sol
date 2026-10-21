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
import {MockCurve, MockPonsFactory, MockToken} from "./mocks/MockPons.sol";

abstract contract BaseTest is Test {
    address internal multisig = makeAddr("multisig");
    address internal creator = makeAddr("creator");
    address internal keeper = makeAddr("keeper");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal ctoTeam = makeAddr("ctoTeam");

    MockPonsFactory internal pons;

    TokenRegistry internal registry;
    PlatformTreasury internal treasury;
    BuybackExecutor internal executor;
    CTOManager internal cto;
    PontoonLauncher internal launcher;

    MockToken internal token;
    MockCurve internal curve;
    FeeVault internal vault;
    HolderRewards internal rewards;

    function setUp() public virtual {
        pons = new MockPonsFactory();

        registry = new TokenRegistry(multisig);
        treasury = new PlatformTreasury(multisig);
        executor = new BuybackExecutor(multisig, registry);
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
        curve = MockCurve(payable(registry.getToken(t).curve));
    }

    /// @dev Test contract calls distribute() and must accept the caller incentive.
    receive() external payable {}

    function _meta() internal pure returns (PontoonLauncher.TokenMeta memory) {
        return PontoonLauncher.TokenMeta({
            name: "Pontoon Test",
            symbol: "PTT",
            logo: "https://example.com/ptt.png",
            description: "test token",
            twitter: "https://x.com/ptt",
            telegram: "",
            website: ""
        });
    }

    /// @dev Launch without an initial buy (msg.value = Pons launch fee only).
    function _launch(address who, FeeConfig memory cfg) internal returns (address t, address v) {
        uint256 fee = launcher.launchFee();
        vm.deal(who, who.balance + fee);
        vm.prank(who);
        (t, v) = launcher.launch{value: fee}(_meta(), address(0), false, cfg);
    }

    /// @dev Pons credits `amount` of creator fees to the vault in its FeeEscrow (as trades + a sweep would).
    function _payFee(uint256 amount) internal {
        vm.deal(address(this), amount);
        pons.creditCreatorFee{value: amount}(address(token));
    }

    /// @dev A real curve buy: creator tax + 70% of the curve fee accrue in the curve until harvested.
    function _buy(address who, uint256 eth) internal returns (uint256 out) {
        vm.deal(who, who.balance + eth);
        vm.prank(who);
        out = curve.buy{value: eth}(eth, 1, who);
    }

    function _stake(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(rewards), amount);
        rewards.stake(amount);
        vm.stopPrank();
    }
}

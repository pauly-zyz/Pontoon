// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PontoonLauncher} from "../src/PontoonLauncher.sol";
import {TokenRegistry} from "../src/TokenRegistry.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {BuybackExecutor} from "../src/BuybackExecutor.sol";
import {HolderRewards} from "../src/HolderRewards.sol";
import {PlatformTreasury} from "../src/PlatformTreasury.sol";
import {CTOManager} from "../src/CTOManager.sol";
import {FeeConfig} from "../src/interfaces/IPontoon.sol";
import {MockPonsFactory, MockRouter, MockToken} from "../test/mocks/MockPons.sol";

/// @notice Local-only (anvil) demo: deploys Pontoon against mock Pons V2 contracts and generates
///         activity for every indexed event. Not for real networks.
///
///   forge script script/LocalDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///   cast rpc evm_increaseTime 259201 && cast rpc evm_mine
///   forge script script/LocalDemo.s.sol --sig "phase2()" --rpc-url http://127.0.0.1:8545 --broadcast
contract LocalDemo is Script {
    string constant MNEMONIC = "test test test test test test test test test test test junk";
    string constant OUT = "./deployments/local.json";

    uint256 deployerPk;
    uint256 multisigPk;
    uint256 creatorAPk;
    uint256 creatorBPk;
    uint256 stakerPk;
    uint256 keeperPk;
    uint256 ctoPk;

    MockPonsFactory pons;
    MockRouter curve;
    MockRouter v4;
    TokenRegistry registry;
    PlatformTreasury treasury;
    BuybackExecutor executor;
    CTOManager cto;
    PontoonLauncher launcher;
    address tokenA;
    address tokenB;
    address vaultA;
    address vaultB;

    function _keys() internal {
        deployerPk = vm.deriveKey(MNEMONIC, 0);
        multisigPk = vm.deriveKey(MNEMONIC, 1);
        creatorAPk = vm.deriveKey(MNEMONIC, 2);
        creatorBPk = vm.deriveKey(MNEMONIC, 3);
        stakerPk = vm.deriveKey(MNEMONIC, 4);
        keeperPk = vm.deriveKey(MNEMONIC, 5);
        ctoPk = vm.deriveKey(MNEMONIC, 6);
    }

    function run() external {
        _keys();
        address multisig = vm.addr(multisigPk);

        // ---- Deploy ----
        vm.startBroadcast(deployerPk);
        pons = new MockPonsFactory();
        curve = new MockRouter();
        v4 = new MockRouter();
        MockToken usdg = new MockToken("USD Global", "USDG");
        registry = new TokenRegistry(vm.addr(deployerPk), pons);
        treasury = new PlatformTreasury(multisig);
        executor = new BuybackExecutor(multisig, registry, pons, curve, v4);
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
        registry.setLauncher(address(launcher));
        registry.transferOwnership(multisig);
        vm.stopBroadcast();

        vm.broadcast(multisigPk);
        launcher.setQuotePair(address(usdg), true);

        // ---- Launch two tokens ----
        vm.broadcast(creatorAPk);
        (tokenA, vaultA) = launcher.launchWithDefaultConfig{value: 0.1 ether}(
            PontoonLauncher.TokenMeta("Pontoon Alpha", "PALPHA", "ipfs://alpha"), address(0), false
        );
        vm.broadcast(creatorBPk);
        (tokenB, vaultB) = launcher.launch(
            PontoonLauncher.TokenMeta("Nvidia Meme", "NVMEME", "ipfs://nvmeme"),
            address(usdg),
            true,
            FeeConfig({buybackBps: 6_000, rewardBps: 3_000})
        );

        // ---- Trades + creator fees from "Pons" ----
        vm.startBroadcast(deployerPk);
        pons.recordTrade(tokenA, vm.addr(stakerPk), true, 3 ether, 3_000e18);
        pons.recordTrade(tokenA, vm.addr(keeperPk), true, 1 ether, 900e18);
        pons.recordTrade(tokenA, vm.addr(keeperPk), false, 0.5 ether, 450e18);
        pons.recordTrade(tokenB, vm.addr(ctoPk), true, 2 ether, 1_500e18);
        pons.payCreatorFee{value: 5 ether}(tokenA);
        pons.payCreatorFee{value: 2 ether}(tokenB);
        curve.setLiquidity(tokenA, 100 ether);
        v4.setLiquidity(tokenB, 50 ether);
        MockToken(tokenA).mint(vm.addr(stakerPk), 1_000e18);
        vm.stopBroadcast();

        // ---- Stake, distribute, claim ----
        HolderRewards rewardsA = HolderRewards(payable(registry.getToken(tokenA).holderRewards));
        vm.startBroadcast(stakerPk);
        MockToken(tokenA).approve(address(rewardsA), type(uint256).max);
        rewardsA.stake(1_000e18);
        vm.stopBroadcast();

        vm.startBroadcast(keeperPk);
        FeeVault(payable(vaultA)).distribute();
        FeeVault(payable(vaultB)).distribute();
        executor.buybackAndBurn(tokenA, 0.5 ether, 1);
        vm.stopBroadcast();

        vm.broadcast(stakerPk);
        rewardsA.claim();
        vm.startBroadcast(stakerPk);
        rewardsA.unstake(200e18);
        vm.stopBroadcast();

        vm.broadcast(creatorAPk);
        FeeVault(payable(vaultA)).claimCreator();

        // ---- Graduation (Pons event + registry copy), V4 buyback ----
        vm.broadcast(deployerPk);
        pons.setGraduated(tokenB, true);
        vm.broadcast(keeperPk);
        registry.markGraduated(tokenB);
        vm.broadcast(keeperPk);
        executor.buybackAndBurn(tokenB, 0.2 ether, 1);

        // ---- Timelocked actions (finished in phase2) ----
        vm.broadcast(creatorAPk);
        FeeVault(payable(vaultA)).queueConfig(FeeConfig({buybackBps: 5_000, rewardBps: 1_000}));
        vm.broadcast(ctoPk);
        cto.requestCTO(tokenB, vm.addr(ctoPk));
        vm.startBroadcast(multisigPk);
        cto.approveCTO(tokenB);
        treasury.queueWithdraw(multisig, 0.1 ether);
        vm.stopBroadcast();

        string memory o = "deployments";
        vm.serializeAddress(o, "PonsFactory", address(pons));
        vm.serializeAddress(o, "PontoonLauncher", address(launcher));
        vm.serializeAddress(o, "TokenRegistry", address(registry));
        vm.serializeAddress(o, "BuybackExecutor", address(executor));
        vm.serializeAddress(o, "PlatformTreasury", address(treasury));
        vm.serializeAddress(o, "CTOManager", address(cto));
        vm.serializeAddress(o, "tokenA", tokenA);
        string memory json = vm.serializeAddress(o, "tokenB", tokenB);
        vm.createDir("./deployments", true);
        vm.writeJson(json, OUT);
        console2.log("written", OUT);
    }

    /// @notice Run after advancing anvil time by > 3 days.
    function phase2() external {
        _keys();
        string memory json = vm.readFile(OUT);
        tokenA = vm.parseJsonAddress(json, ".tokenA");
        tokenB = vm.parseJsonAddress(json, ".tokenB");
        registry = TokenRegistry(vm.parseJsonAddress(json, ".TokenRegistry"));
        cto = CTOManager(vm.parseJsonAddress(json, ".CTOManager"));
        treasury = PlatformTreasury(payable(vm.parseJsonAddress(json, ".PlatformTreasury")));
        pons = MockPonsFactory(vm.parseJsonAddress(json, ".PonsFactory"));
        vaultA = registry.getToken(tokenA).vault;
        vaultB = registry.getToken(tokenB).vault;

        vm.startBroadcast(keeperPk);
        cto.executeCTO(tokenB);
        FeeVault(payable(vaultA)).applyConfig();
        vm.stopBroadcast();

        vm.startBroadcast(deployerPk);
        pons.recordTrade(tokenA, vm.addr(keeperPk), true, 0.8 ether, 700e18);
        pons.payCreatorFee{value: 1 ether}(tokenA);
        pons.payCreatorFee{value: 1 ether}(tokenB);
        vm.stopBroadcast();

        vm.startBroadcast(keeperPk);
        FeeVault(payable(vaultA)).distribute();
        FeeVault(payable(vaultB)).distribute();
        vm.stopBroadcast();

        vm.broadcast(multisigPk);
        treasury.withdraw(0);
    }
}

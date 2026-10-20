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
import {IPonsV2Factory, ISwapRoute} from "../src/interfaces/IPonsV2.sol";

/// @notice Env: MULTISIG, PONS_FACTORY, PONS_ROUTER, V4_ADAPTER.
/// The deployer temporarily owns TokenRegistry to wire the launcher, then hands it to the multisig.
contract Deploy is Script {
    function run() external {
        address multisig = vm.envAddress("MULTISIG");
        IPonsV2Factory pons = IPonsV2Factory(vm.envAddress("PONS_FACTORY"));
        ISwapRoute curve = ISwapRoute(vm.envAddress("PONS_ROUTER"));
        ISwapRoute v4 = ISwapRoute(vm.envAddress("V4_ADAPTER"));

        vm.startBroadcast();
        TokenRegistry registry = new TokenRegistry(msg.sender, pons);
        PlatformTreasury treasury = new PlatformTreasury(multisig);
        BuybackExecutor executor = new BuybackExecutor(multisig, registry, pons, curve, v4);
        CTOManager cto = new CTOManager(multisig, registry);
        PontoonLauncher launcher = new PontoonLauncher(
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

        console2.log("TokenRegistry   ", address(registry));
        console2.log("PlatformTreasury", address(treasury));
        console2.log("BuybackExecutor ", address(executor));
        console2.log("CTOManager      ", address(cto));
        console2.log("PontoonLauncher ", address(launcher));
    }
}

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
import {IPonsV2LaunchFactory} from "../src/interfaces/IPonsV2Live.sol";

/// @notice Deploys Pontoon on top of the live Pons V2 factory.
/// Env: MULTISIG (owner of everything). Optional PONS_FACTORY (defaults to Robinhood Chain mainnet).
/// The deployer temporarily owns TokenRegistry to wire the launcher, then hands it to the multisig.
contract Deploy is Script {
    address constant PONS_FACTORY_MAINNET = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;

    function run() external returns (PontoonLauncher launcher) {
        address multisig = vm.envAddress("MULTISIG");
        IPonsV2LaunchFactory pons = IPonsV2LaunchFactory(vm.envOr("PONS_FACTORY", PONS_FACTORY_MAINNET));
        require(address(pons).code.length > 0, "Pons factory not found on this chain");

        vm.startBroadcast();
        launcher = deploy(multisig, pons, msg.sender);
        vm.stopBroadcast();
    }

    function deploy(address multisig, IPonsV2LaunchFactory pons, address deployer)
        public
        returns (PontoonLauncher launcher)
    {
        TokenRegistry registry = new TokenRegistry(deployer);
        PlatformTreasury treasury = new PlatformTreasury(multisig);
        BuybackExecutor executor = new BuybackExecutor(multisig, registry);
        CTOManager cto = new CTOManager(multisig, registry);
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

        console2.log("TokenRegistry   ", address(registry));
        console2.log("PlatformTreasury", address(treasury));
        console2.log("BuybackExecutor ", address(executor));
        console2.log("CTOManager      ", address(cto));
        console2.log("PontoonLauncher ", address(launcher));
    }
}

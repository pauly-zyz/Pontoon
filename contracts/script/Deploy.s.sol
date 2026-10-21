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
/// Env: MULTISIG (owner of everything, must be a contract such as a Safe; set ALLOW_EOA_OWNER=true only for
/// throwaway test deployments). Optional PONS_FACTORY (defaults to Robinhood Chain mainnet).
/// The deployer temporarily owns TokenRegistry to wire the launcher, then hands it to the multisig.
/// Writes deployments/<chainId>.json with every address and the start block for the indexer.
contract Deploy is Script {
    address constant PONS_FACTORY_MAINNET = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;

    function run() external returns (PontoonLauncher launcher) {
        address multisig = vm.envAddress("MULTISIG");
        IPonsV2LaunchFactory pons = IPonsV2LaunchFactory(vm.envOr("PONS_FACTORY", PONS_FACTORY_MAINNET));
        require(address(pons).code.length > 0, "Pons factory not found on this chain");
        require(
            _isContract(multisig) || vm.envOr("ALLOW_EOA_OWNER", false), "MULTISIG must be a contract (e.g. a Safe)"
        );
        uint256 startBlock = block.number;

        vm.startBroadcast();
        launcher = deploy(multisig, pons, msg.sender);
        vm.stopBroadcast();

        _check(launcher, multisig, pons);
        _write(launcher, startBlock);
    }

    /// @dev True for real contracts; false for plain EOAs and EIP-7702 delegated EOAs (code = 0xef0100 || address).
    function _isContract(address a) internal view returns (bool) {
        bytes memory code = a.code;
        if (code.length == 0) return false;
        return !(code.length == 23 && code[0] == 0xef && code[1] == 0x01 && code[2] == 0x00);
    }

    /// @dev Post-deploy sanity checks: every owner is the multisig and the wiring is consistent.
    function _check(PontoonLauncher launcher, address multisig, IPonsV2LaunchFactory pons) internal view {
        TokenRegistry registry = TokenRegistry(address(launcher.registry()));
        require(launcher.owner() == multisig, "launcher owner");
        require(registry.owner() == multisig, "registry owner");
        require(registry.launcher() == address(launcher), "registry launcher");
        require(BuybackExecutor(payable(launcher.buybackExecutor())).owner() == multisig, "executor owner");
        require(PlatformTreasury(payable(launcher.treasury())).owner() == multisig, "treasury owner");
        require(CTOManager(launcher.ctoManager()).owner() == multisig, "cto owner");
        require(address(launcher.ponsFactory()) == address(pons), "pons factory");
        require(launcher.minCreatorTaxBps() <= launcher.defaultCreatorTaxBps(), "creator tax bounds");
        require(launcher.defaultCreatorTaxBps() <= pons.maxCreatorTaxBps(), "creator tax");
    }

    function _write(PontoonLauncher launcher, uint256 startBlock) internal {
        string memory o = "deploy";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "startBlock", startBlock);
        vm.serializeAddress(o, "PonsFactory", address(launcher.ponsFactory()));
        vm.serializeAddress(o, "TokenRegistry", address(launcher.registry()));
        vm.serializeAddress(o, "BuybackExecutor", launcher.buybackExecutor());
        vm.serializeAddress(o, "PlatformTreasury", launcher.treasury());
        vm.serializeAddress(o, "CTOManager", launcher.ctoManager());
        string memory json = vm.serializeAddress(o, "PontoonLauncher", address(launcher));
        string memory file = string.concat("./deployments/", vm.toString(block.chainid), ".json");
        vm.createDir("./deployments", true);
        vm.writeJson(json, file);
        console2.log("written", file);
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

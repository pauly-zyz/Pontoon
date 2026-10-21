// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
}

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

/// @notice Moves ownership of every official Pontoon contract (current set and the paused first set) to a
///         Safe multisig. Either pass SAFE (an existing Safe), or SAFE_OWNERS (comma-separated) and
///         SAFE_THRESHOLD to create a Safe 1.4.1 first. Must be broadcast by the current owner.
///   SAFE_OWNERS=0xA,0xB,0xC SAFE_THRESHOLD=2 forge script script/TransferToSafe.s.sol \
///     --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast --slow --private-key "$OWNER_PK"
/// Ownership transfer is one step and final: check the Safe's owners before broadcasting.
contract TransferToSafe is Script {
    // Safe v1.4.1 canonical deployments (present on Robinhood Chain).
    ISafeProxyFactory constant FACTORY = ISafeProxyFactory(0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67);
    address constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address constant FALLBACK_HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;

    function _contracts() internal pure returns (address[10] memory c) {
        // Current official set (contracts/deployments/4663.json)
        c[0] = 0x23b2f18e2C190dB01E4ae2C13157d8e82a1f548E; // PontoonLauncher
        c[1] = 0x94B8b52D957f2Bb4006266AfcbECE22a04c64818; // TokenRegistry
        c[2] = 0x8BCfBf71509374062f292c341ab00e9314b72784; // BuybackExecutor
        c[3] = 0xC31A1F1B2fd11cD9A2E830610f7B963A27A020c8; // PlatformTreasury
        c[4] = 0xCb9Eea98eF137cd19dC6C83AB70e97d805fCB2c3; // CTOManager
        // First official set (never used, launcher paused)
        c[5] = 0xF322fACa574c05138c30D31997E6ABF03d6441eC;
        c[6] = 0xc7D03457D9171d0645B19A1002ba855442e55232;
        c[7] = 0xE8D4c92B2868F34E56BB0dDA83D0916a76afAb9f;
        c[8] = 0x53dB0bcf8c5e003B5219bE5593a64C894851110b;
        c[9] = 0xaa0cAecdFa2275FCAe602b43358F43bDFa631680;
    }

    function run() external returns (address safe) {
        safe = vm.envOr("SAFE", address(0));
        vm.startBroadcast();
        if (safe == address(0)) safe = _createSafe();
        _checkSafe(safe);

        address[10] memory c = _contracts();
        for (uint256 i; i < c.length; i++) {
            Ownable o = Ownable(c[i]);
            if (o.owner() == safe) continue;
            require(o.owner() == msg.sender, "broadcaster is not the current owner");
            o.transferOwnership(safe);
        }
        vm.stopBroadcast();

        for (uint256 i; i < c.length; i++) {
            require(Ownable(c[i]).owner() == safe, "transfer failed");
        }
        console2.log("All Pontoon contracts are now owned by the Safe", safe);
    }

    function _createSafe() internal returns (address) {
        address[] memory owners = vm.envAddress("SAFE_OWNERS", ",");
        uint256 threshold = vm.envUint("SAFE_THRESHOLD");
        bytes memory init = abi.encodeCall(
            ISafe.setup, (owners, threshold, address(0), "", FALLBACK_HANDLER, address(0), 0, payable(address(0)))
        );
        address safe = FACTORY.createProxyWithNonce(SAFE_L2_SINGLETON, init, uint256(keccak256("pontoon")));
        console2.log("Created Safe", safe);
        return safe;
    }

    /// @dev A real multisig: code, at least 2 signatures needed, and not a 1-of-1 wrapper.
    function _checkSafe(address safe) internal view {
        require(safe.code.length > 0, "SAFE has no code");
        uint256 threshold = ISafe(safe).getThreshold();
        address[] memory owners = ISafe(safe).getOwners();
        require(threshold >= 2, "Safe threshold must be at least 2");
        require(owners.length >= threshold, "Safe has fewer owners than its threshold");
        console2.log("Safe threshold", threshold, "of", owners.length);
        for (uint256 i; i < owners.length; i++) {
            console2.log("  owner", owners[i]);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITokenRegistry} from "./interfaces/IPontoon.sol";
import {IPonsV2Curve} from "./interfaces/IPonsV2Live.sol";

/// @title TokenRegistry
/// @notice Source of truth for every token launched through Pontoon.
contract TokenRegistry is ITokenRegistry, Ownable {
    address public launcher;

    mapping(address token => TokenInfo) private _tokens;
    address[] public allTokens;

    event LauncherSet(address indexed launcher);
    event TokenRegistered(
        address indexed token, address indexed creator, address curve, address vault, address holderRewards
    );
    event Graduated(address indexed token);
    event MemestockTagSet(address indexed token, bool isMemestock);

    error NotLauncher();
    error AlreadyRegistered();
    error NotRegisteredToken();
    error NotGraduated();
    error AlreadyGraduated();
    error LauncherAlreadySet();

    constructor(address owner_) Ownable(owner_) {}

    /// @notice One-time wiring so the launcher cannot be swapped later.
    function setLauncher(address launcher_) external onlyOwner {
        if (launcher != address(0)) revert LauncherAlreadySet();
        launcher = launcher_;
        emit LauncherSet(launcher_);
    }

    function register(
        address token,
        address curve,
        address creator,
        address quoteAsset,
        bool isMemestock,
        address vault,
        address holderRewards
    ) external {
        if (msg.sender != launcher) revert NotLauncher();
        if (_tokens[token].vault != address(0)) revert AlreadyRegistered();
        _tokens[token] = TokenInfo({
            creator: creator,
            curve: curve,
            quoteAsset: quoteAsset,
            vault: vault,
            holderRewards: holderRewards,
            isMemestock: isMemestock,
            graduated: false,
            launchedAt: uint64(block.timestamp)
        });
        allTokens.push(token);
        emit TokenRegistered(token, creator, curve, vault, holderRewards);
    }

    /// @notice Permissionless: copies the Pons V2 graduation state (read from the curve) into the registry.
    function markGraduated(address token) external {
        TokenInfo storage info = _tokens[token];
        if (info.vault == address(0)) revert NotRegisteredToken();
        if (info.graduated) revert AlreadyGraduated();
        if (!IPonsV2Curve(info.curve).graduated()) revert NotGraduated();
        info.graduated = true;
        emit Graduated(token);
    }

    /// @notice Moderation of the memestock tag (feature 4).
    function setMemestock(address token, bool isMemestock) external onlyOwner {
        if (_tokens[token].vault == address(0)) revert NotRegisteredToken();
        _tokens[token].isMemestock = isMemestock;
        emit MemestockTagSet(token, isMemestock);
    }

    function getToken(address token) external view returns (TokenInfo memory) {
        return _tokens[token];
    }

    function isRegistered(address token) external view returns (bool) {
        return _tokens[token].vault != address(0);
    }

    function isGraduated(address token) public view returns (bool) {
        TokenInfo storage info = _tokens[token];
        return info.graduated || (info.curve != address(0) && IPonsV2Curve(info.curve).graduated());
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }
}

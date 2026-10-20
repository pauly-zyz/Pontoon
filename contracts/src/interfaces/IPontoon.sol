// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Creator fee split, in basis points of what remains after the platform fee.
/// Creator payout is implicit: 10_000 - buybackBps - rewardBps.
struct FeeConfig {
    uint16 buybackBps;
    uint16 rewardBps;
}

interface IPlatformConfig {
    function platformFeeBps() external view returns (uint16);
}

interface IFeeVault {
    function initialize(
        address token,
        address admin,
        address holderRewards,
        address buybackExecutor,
        address treasury,
        address ctoManager,
        FeeConfig calldata config
    ) external;

    function admin() external view returns (address);
    function token() external view returns (address);
    function setAdmin(address newAdmin) external;
}

interface IHolderRewards {
    function initialize(address token) external;
    function notifyReward() external payable;
}

interface IBuybackExecutor {
    function depositFor(address token) external payable;
}

interface ITokenRegistry {
    struct TokenInfo {
        address creator;
        address quoteAsset;
        address vault;
        address holderRewards;
        bool isMemestock;
        bool graduated;
        uint64 launchedAt;
    }

    function register(
        address token,
        address creator,
        address quoteAsset,
        bool isMemestock,
        address vault,
        address holderRewards
    ) external;

    function getToken(address token) external view returns (TokenInfo memory);
    function isRegistered(address token) external view returns (bool);
}

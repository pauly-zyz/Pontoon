// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// PLACEHOLDER: these interfaces stand in for the real Pons V2 ABI.
// Replace them with the official ABI and addresses in stage 4 (integration).

/// @notice Swap surface shared by the Pons V2 bonding-curve router and the Uniswap V4 adapter.
/// `quoteAsset` is the token's quote pair (address(0) = ETH). For non-ETH pairs the router is
/// expected to route ETH -> quoteAsset -> token.
interface ISwapRoute {
    function swapExactETHForTokens(address token, address quoteAsset, uint256 minOut, address recipient)
        external
        payable
        returns (uint256 amountOut);

    /// @notice ETH-denominated liquidity backing `token`, used to cap buyback size.
    function ethLiquidity(address token, address quoteAsset) external view returns (uint256);
}

/// @notice Pons V2 bonding-curve router (used before graduation).
interface IPonsV2Router is ISwapRoute {}

/// @notice Adapter around the locked Uniswap V4 pool (used after graduation).
interface IUniswapV4SwapAdapter is ISwapRoute {}

/// @notice Pons V2 token factory.
interface IPonsV2Factory {
    struct CreateParams {
        string name;
        string symbol;
        string metadataURI;
        address quoteAsset; // address(0) = ETH
        address feeRecipient; // receives the creator share of the 1% fee, in ETH
        address initialBuyRecipient; // receives tokens bought with msg.value, if any
    }

    function createToken(CreateParams calldata params) external payable returns (address token);

    function isGraduated(address token) external view returns (bool);
}

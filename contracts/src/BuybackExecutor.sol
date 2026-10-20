// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITokenRegistry} from "./interfaces/IPontoon.sol";
import {IPonsV2Factory, ISwapRoute} from "./interfaces/IPonsV2.sol";

/// @title BuybackExecutor
/// @notice Holds each token's buyback ETH and lets anyone buy the token and send it to 0x...dEaD.
///         Before graduation the swap goes through the Pons V2 curve router, after graduation
///         through the Uniswap V4 adapter. Routes are immutable so the owner can never redirect funds.
/// @dev Owner (Pontoon multisig) can only pause new buybacks. It cannot move ETH.
contract BuybackExecutor is Ownable, ReentrancyGuard {
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MAX_BUYBACK_ETH = 0.5 ether;
    uint256 public constant MAX_LIQUIDITY_BPS = 100; // 1% of pool liquidity

    ITokenRegistry public immutable registry;
    IPonsV2Factory public immutable ponsFactory;
    ISwapRoute public immutable curveRouter;
    ISwapRoute public immutable v4Router;

    bool public paused;
    mapping(address token => uint256) public pendingETH;
    mapping(address token => uint256) public totalETHSpent;
    mapping(address token => uint256) public totalBurned;

    event BuybackFunded(address indexed token, uint256 amount);
    event BuybackExecuted(address indexed token, uint256 ethIn, uint256 tokensBurned);
    event Paused(bool paused);

    error NotRegistered();
    error IsPaused();
    error ZeroMinOut();
    error ZeroAmount();
    error InsufficientPending();
    error ExceedsCap(uint256 cap);
    error Slippage();

    constructor(
        address owner_,
        ITokenRegistry registry_,
        IPonsV2Factory ponsFactory_,
        ISwapRoute curveRouter_,
        ISwapRoute v4Router_
    ) Ownable(owner_) {
        registry = registry_;
        ponsFactory = ponsFactory_;
        curveRouter = curveRouter_;
        v4Router = v4Router_;
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    /// @notice Called by FeeVault during distribute(). Never paused.
    function depositFor(address token) external payable {
        if (!registry.isRegistered(token)) revert NotRegistered();
        pendingETH[token] += msg.value;
        emit BuybackFunded(token, msg.value);
    }

    function routeFor(address token) public view returns (ISwapRoute) {
        return ponsFactory.isGraduated(token) ? v4Router : curveRouter;
    }

    /// @notice Max ETH per execution: min(0.5 ETH, 1% of pool liquidity).
    function maxBuyback(address token) public view returns (uint256 cap) {
        address quote = registry.getToken(token).quoteAsset;
        cap = routeFor(token).ethLiquidity(token, quote) * MAX_LIQUIDITY_BPS / 10_000;
        if (cap > MAX_BUYBACK_ETH) cap = MAX_BUYBACK_ETH;
    }

    /// @notice Permissionless. `minOut` is mandatory to limit sandwiching.
    function buybackAndBurn(address token, uint256 amount, uint256 minOut)
        external
        nonReentrant
        returns (uint256 burned)
    {
        if (paused) revert IsPaused();
        if (amount == 0) revert ZeroAmount();
        if (minOut == 0) revert ZeroMinOut();
        if (amount > pendingETH[token]) revert InsufficientPending();
        uint256 cap = maxBuyback(token);
        if (amount > cap) revert ExceedsCap(cap);

        pendingETH[token] -= amount;
        address quote = registry.getToken(token).quoteAsset;

        uint256 before = IERC20(token).balanceOf(BURN_ADDRESS);
        routeFor(token).swapExactETHForTokens{value: amount}(token, quote, minOut, BURN_ADDRESS);
        burned = IERC20(token).balanceOf(BURN_ADDRESS) - before;
        if (burned < minOut) revert Slippage();

        totalETHSpent[token] += amount;
        totalBurned[token] += burned;
        emit BuybackExecuted(token, amount, burned);
    }
}

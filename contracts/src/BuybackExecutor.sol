// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IHolderRewards, ITokenRegistry} from "./interfaces/IPontoon.sol";
import {IPonsV2Curve} from "./interfaces/IPonsV2Live.sol";

/// @title BuybackExecutor
/// @notice Holds each token's buyback ETH and lets anyone buy the token on its Pons V2 bonding curve,
///         delivering the tokens straight to 0x...dEaD.
///         After graduation the token trades on Uniswap V4, which this executor does not route yet;
///         pending ETH can then be redirected (by anyone) to the token's stakers, so it never sits idle.
/// @dev Owner (Pontoon multisig) can only pause new buybacks. It cannot move ETH.
contract BuybackExecutor is Ownable, ReentrancyGuard {
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MAX_BUYBACK_ETH = 0.5 ether;
    uint256 public constant MAX_LIQUIDITY_BPS = 100; // 1% of the curve's quote reserve

    ITokenRegistry public immutable registry;

    bool public paused;
    mapping(address token => uint256) public pendingETH;
    mapping(address token => uint256) public totalETHSpent;
    mapping(address token => uint256) public totalBurned;
    mapping(address token => uint256) public totalRedirected;

    event BuybackFunded(address indexed token, uint256 amount);
    event BuybackExecuted(address indexed token, uint256 ethIn, uint256 tokensBurned);
    event BuybackRedirectedToRewards(address indexed token, uint256 amount);
    event Paused(bool paused);

    error NotRegistered();
    error IsPaused();
    error ZeroMinOut();
    error ZeroAmount();
    error InsufficientPending();
    error ExceedsCap(uint256 cap);
    error Slippage();
    error Graduated();
    error NotGraduated();

    constructor(address owner_, ITokenRegistry registry_) Ownable(owner_) {
        registry = registry_;
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

    function _curve(address token) internal view returns (IPonsV2Curve) {
        return IPonsV2Curve(registry.getToken(token).curve);
    }

    /// @notice Max ETH per execution: min(0.5 ETH, 1% of the curve's quote reserve). Zero after graduation.
    function maxBuyback(address token) public view returns (uint256 cap) {
        IPonsV2Curve curve = _curve(token);
        if (curve.graduated()) return 0;
        cap = curve.quoteReserve() * MAX_LIQUIDITY_BPS / 10_000;
        if (cap > MAX_BUYBACK_ETH) cap = MAX_BUYBACK_ETH;
    }

    /// @notice Permissionless. Buys on the bonding curve with `amount` of the token's pending ETH and
    ///         sends the tokens to 0x...dEaD. `minOut` is mandatory to limit sandwiching.
    function buybackAndBurn(address token, uint256 amount, uint256 minOut)
        external
        nonReentrant
        returns (uint256 burned)
    {
        if (paused) revert IsPaused();
        if (amount == 0) revert ZeroAmount();
        if (minOut == 0) revert ZeroMinOut();
        if (amount > pendingETH[token]) revert InsufficientPending();
        IPonsV2Curve curve = _curve(token);
        if (curve.graduated()) revert Graduated();
        uint256 cap = maxBuyback(token);
        if (amount > cap) revert ExceedsCap(cap);

        pendingETH[token] -= amount;
        uint256 before = IERC20(token).balanceOf(BURN_ADDRESS);
        curve.buy{value: amount}(amount, minOut, BURN_ADDRESS);
        burned = IERC20(token).balanceOf(BURN_ADDRESS) - before;
        if (burned < minOut) revert Slippage();

        totalETHSpent[token] += amount;
        totalBurned[token] += burned;
        emit BuybackExecuted(token, amount, burned);
    }

    /// @notice Permissionless, only after graduation: sends the token's pending buyback ETH to its stakers
    ///         (HolderRewards), since Uniswap V4 buybacks are not supported yet.
    function redirectToRewards(address token) external nonReentrant returns (uint256 amount) {
        if (!registry.isRegistered(token)) revert NotRegistered();
        if (!_curve(token).graduated()) revert NotGraduated();
        amount = pendingETH[token];
        if (amount == 0) revert ZeroAmount();
        pendingETH[token] = 0;
        totalRedirected[token] += amount;
        IHolderRewards(registry.getToken(token).holderRewards).notifyReward{value: amount}();
        emit BuybackRedirectedToRewards(token, amount);
    }
}

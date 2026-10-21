// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20 ^0.8.28;

// lib/openzeppelin-contracts/contracts/utils/Context.sol

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol

// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// src/interfaces/IPonsV2Live.sol

// Interfaces for the live Pons V2 contracts on Robinhood Chain mainnet (chain 4663).
// Factory, router, FeeEscrow and BuybackVault come from their published ABIs. The per-token curve is
// not verified on the explorer; its functions were matched against real transactions and bytecode.

interface IPonsV2LaunchFactory {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
        bytes32 salt;
    }

    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    event TokenLaunched(
        address indexed token,
        address indexed curve,
        address indexed deployer,
        address pairToken,
        uint256 launchConfigId,
        uint256 graduationThreshold
    );
    event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount);

    function launchToken(TokenParams calldata params, uint256 launchConfigId, address pairToken)
        external
        payable
        returns (address token, address curve);

    /// @notice Same, exempting the listed addresses from the launch snipe tax (e.g. the launcher's initial buy).
    function launchToken(
        TokenParams calldata params,
        uint256 launchConfigId,
        address pairToken,
        address[] calldata snipeTaxExemptions
    ) external payable returns (address token, address curve);

    function memeHook() external view returns (address);
    function snipeTaxStartBps() external view returns (uint256);
    function snipeTaxSeconds() external view returns (uint256);

    function previewLaunchEconomics(uint256 launchConfigId, address pairToken) external view returns (bytes32);
    function launchFee() external view returns (uint256);
    function launchEnabled() external view returns (bool);
    function canLaunch(address launcher) external view returns (bool);
    function maxCreatorTaxBps() external view returns (uint256);
    function feeEscrow() external view returns (address);
    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
}

interface IPonsV2FeeEscrow {
    event Credited(address indexed recipient, address indexed depositor, uint256 amount);
    event Claimed(address indexed recipient, uint256 amount);

    function balanceOf(address recipient) external view returns (uint256);
    /// @notice Sends the caller's whole ETH balance to the caller.
    function claim() external returns (uint256 amount);
}

/// @notice Calls into Pons contracts whose source is not published. Selectors were taken from real
///         mainnet transactions (see contracts/README.md), so they are called by selector, not by name.
library PonsV2Raw {
    /// MemeHook getter returning the only address allowed to sweep curve fees (the fee harvester).
    bytes4 internal constant MEME_HOOK_FEE_HARVESTER = 0x8a36a6bb;
    /// Fee harvester entry point; permissionless. Arg: curve address.
    bytes4 internal constant HARVESTER_HARVEST = 0xe6b71b11;

    function feeHarvester(address memeHook) internal view returns (address harvester) {
        (bool ok, bytes memory ret) = memeHook.staticcall(abi.encodeWithSelector(MEME_HOOK_FEE_HARVESTER));
        if (ok && ret.length >= 32) harvester = abi.decode(ret, (address));
    }

    /// @dev Never reverts: a failed sweep must not block distributing fees already in the escrow.
    function harvest(address harvester, address curve) internal returns (bool ok) {
        if (harvester == address(0)) return false;
        (ok,) = harvester.call(abi.encodeWithSelector(HARVESTER_HARVEST, curve));
    }
}

/// @notice Per-token bonding curve (pair = native ETH when pairToken == address(0)).
interface IPonsV2Curve {
    event CurveBuy(
        address indexed buyer,
        address indexed recipient,
        uint256 quoteIn,
        uint256 tokensOut,
        uint256 curveFee,
        uint256 creatorTax
    );
    event CurveSell(
        address indexed seller,
        address indexed recipient,
        uint256 tokensIn,
        uint256 quoteOut,
        uint256 curveFee,
        uint256 creatorTax
    );

    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256);
    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) external returns (uint256);
    function token() external view returns (address);
    function pairToken() external view returns (address);
    function graduated() external view returns (bool);
    /// @notice Virtual (phantom) plus real quote reserve, i.e. the curve's pricing liquidity.
    function quoteReserve() external view returns (uint256);
    /// @notice Real ETH raised so far; the curve graduates when it reaches graduationThreshold().
    function realQuoteReserve() external view returns (uint256);
    /// @notice Tokens left on the curve. Price = quoteReserve / tokenReserve (constant product).
    function tokenReserve() external view returns (uint256);
    function creatorTaxBps() external view returns (uint16);
    function launchedAt() external view returns (uint256);
    function graduationThreshold() external view returns (uint256);
}

// src/interfaces/IPontoon.sol

/// @notice Creator fee split, in basis points of what remains after the platform fee.
/// Creator payout is implicit: 10_000 - buybackBps - rewardBps.
struct FeeConfig {
    uint16 buybackBps;
    uint16 rewardBps;
}

interface IPlatformConfig {
    function platformFeeBps() external view returns (uint16);
}

/// @notice Addresses a FeeVault needs, set once at initialize.
struct VaultWiring {
    address token;
    address curve; // Pons V2 bonding curve of the token
    address admin; // creator, until a CTO
    address holderRewards;
    address buybackExecutor;
    address treasury;
    address ctoManager;
    address ponsFeeEscrow;
    address ponsMemeHook;
}

interface IFeeVault {
    function initialize(VaultWiring calldata wiring, FeeConfig calldata config) external;
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
        address curve;
        address quoteAsset;
        address vault;
        address holderRewards;
        bool isMemestock;
        bool graduated;
        uint64 launchedAt;
    }

    function register(
        address token,
        address curve,
        address creator,
        address quoteAsset,
        bool isMemestock,
        address vault,
        address holderRewards
    ) external;

    function getToken(address token) external view returns (TokenInfo memory);
    function isRegistered(address token) external view returns (bool);
}

// lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}

// lib/openzeppelin-contracts/contracts/access/Ownable.sol

// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// src/BuybackExecutor.sol

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

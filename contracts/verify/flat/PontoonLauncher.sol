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

// lib/openzeppelin-contracts/contracts/utils/Errors.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/Errors.sol)

/**
 * @dev Collection of common custom errors used in multiple contracts
 *
 * IMPORTANT: Backwards compatibility is not guaranteed in future versions of the library.
 * It is recommended to avoid relying on the error API for critical functionality.
 *
 * _Available since v5.1._
 */
library Errors {
    /**
     * @dev The ETH balance of the account is not enough to perform the operation.
     */
    error InsufficientBalance(uint256 balance, uint256 needed);

    /**
     * @dev A call to an address target failed. The target may have reverted.
     */
    error FailedCall();

    /**
     * @dev The deployment failed.
     */
    error FailedDeployment();

    /**
     * @dev A necessary precompile is missing.
     */
    error MissingPrecompile(address);
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

// lib/openzeppelin-contracts/contracts/proxy/Clones.sol

// OpenZeppelin Contracts (last updated v5.1.0) (proxy/Clones.sol)

/**
 * @dev https://eips.ethereum.org/EIPS/eip-1167[ERC-1167] is a standard for
 * deploying minimal proxy contracts, also known as "clones".
 *
 * > To simply and cheaply clone contract functionality in an immutable way, this standard specifies
 * > a minimal bytecode implementation that delegates all calls to a known, fixed address.
 *
 * The library includes functions to deploy a proxy using either `create` (traditional deployment) or `create2`
 * (salted deterministic deployment). It also includes functions to predict the addresses of clones deployed using the
 * deterministic method.
 */
library Clones {
    /**
     * @dev Deploys and returns the address of a clone that mimics the behaviour of `implementation`.
     *
     * This function uses the create opcode, which should never revert.
     */
    function clone(address implementation) internal returns (address instance) {
        return clone(implementation, 0);
    }

    /**
     * @dev Same as {xref-Clones-clone-address-}[clone], but with a `value` parameter to send native currency
     * to the new contract.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function clone(address implementation, uint256 value) internal returns (address instance) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        assembly ("memory-safe") {
            // Cleans the upper 96 bits of the `implementation` word, then packs the first 3 bytes
            // of the `implementation` address with the bytecode before the address.
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            // Packs the remaining 17 bytes of `implementation` with the bytecode after the address.
            mstore(0x20, or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(value, 0x09, 0x37)
        }
        if (instance == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Deploys and returns the address of a clone that mimics the behaviour of `implementation`.
     *
     * This function uses the create2 opcode and a `salt` to deterministically deploy
     * the clone. Using the same `implementation` and `salt` multiple time will revert, since
     * the clones cannot be deployed twice at the same address.
     */
    function cloneDeterministic(address implementation, bytes32 salt) internal returns (address instance) {
        return cloneDeterministic(implementation, salt, 0);
    }

    /**
     * @dev Same as {xref-Clones-cloneDeterministic-address-bytes32-}[cloneDeterministic], but with
     * a `value` parameter to send native currency to the new contract.
     *
     * NOTE: Using a non-zero value at creation will require the contract using this function (e.g. a factory)
     * to always have enough balance for new deployments. Consider exposing this function under a payable method.
     */
    function cloneDeterministic(
        address implementation,
        bytes32 salt,
        uint256 value
    ) internal returns (address instance) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        assembly ("memory-safe") {
            // Cleans the upper 96 bits of the `implementation` word, then packs the first 3 bytes
            // of the `implementation` address with the bytecode before the address.
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            // Packs the remaining 17 bytes of `implementation` with the bytecode after the address.
            mstore(0x20, or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create2(value, 0x09, 0x37, salt)
        }
        if (instance == address(0)) {
            revert Errors.FailedDeployment();
        }
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministic}.
     */
    function predictDeterministicAddress(
        address implementation,
        bytes32 salt,
        address deployer
    ) internal pure returns (address predicted) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(add(ptr, 0x38), deployer)
            mstore(add(ptr, 0x24), 0x5af43d82803e903d91602b57fd5bf3ff)
            mstore(add(ptr, 0x14), implementation)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73)
            mstore(add(ptr, 0x58), salt)
            mstore(add(ptr, 0x78), keccak256(add(ptr, 0x0c), 0x37))
            predicted := and(keccak256(add(ptr, 0x43), 0x55), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministic}.
     */
    function predictDeterministicAddress(
        address implementation,
        bytes32 salt
    ) internal view returns (address predicted) {
        return predictDeterministicAddress(implementation, salt, address(this));
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

// src/PontoonLauncher.sol

/// @title PontoonLauncher
/// @notice Entry point for launches. Clones a FeeVault + HolderRewards per token, launches the token on the
///         live Pons V2 factory with the FeeVault as creator-fee recipient, registers it, and (optionally)
///         buys for the creator in the same transaction, exempt from the launch snipe tax.
///         Also holds the global platform fee that every FeeVault reads.
contract PontoonLauncher is IPlatformConfig, Ownable, ReentrancyGuard {
    uint16 public constant MAX_PLATFORM_FEE_BPS = 3_000;
    uint16 public constant DEFAULT_BUYBACK_BPS = 4_000;
    uint16 public constant DEFAULT_REWARD_BPS = 2_000;
    address public constant ETH = address(0);

    struct TokenMeta {
        string name;
        string symbol;
        string logo; // image URL
        string description;
        string twitter;
        string telegram;
        string website;
    }

    IPonsV2LaunchFactory public immutable ponsFactory;
    ITokenRegistry public immutable registry;
    address public immutable feeVaultImpl;
    address public immutable holderRewardsImpl;
    address public immutable buybackExecutor;
    address public immutable treasury;
    address public immutable ctoManager;

    uint16 public platformFeeBps = 2_000;
    /// @notice Creators pick their token's Pons creator tax (paid on curve trades into the FeeVault) between
    ///         `minCreatorTaxBps` and the Pons maximum. `defaultCreatorTaxBps` is used by launchWithDefaultConfig.
    uint16 public minCreatorTaxBps = 100;
    uint16 public defaultCreatorTaxBps = 100;
    uint256 public launchConfigId; // Pons launch config (0 = standard 1B supply, 4.2 ETH graduation)
    bool public paused;
    /// @notice Allowed quote pairs. Only ETH (address(0)) is supported for now.
    mapping(address => bool) public quotePairAllowed;
    uint256 public launchCount;

    event TokenLaunched(
        address indexed token, address indexed creator, address quotePair, bool isMemestock, address vault
    );
    event TokenMetadata(address indexed token, TokenMeta meta);
    event InitialBuy(address indexed token, address indexed creator, uint256 ethIn, uint256 tokensOut);
    event PlatformFeeSet(uint16 bps);
    event CreatorTaxBoundsSet(uint16 minBps, uint16 defaultBps);
    event LaunchConfigIdSet(uint256 id);
    event QuotePairSet(address indexed quoteAsset, bool allowed);
    event Paused(bool paused);

    error IsPaused();
    error QuotePairNotAllowed();
    error FeeTooHigh();
    error CreatorTaxOutOfRange(uint16 minBps, uint16 maxBps);
    error InsufficientLaunchFee(uint256 required);
    error PonsLaunchDisabled();

    constructor(
        address owner_,
        IPonsV2LaunchFactory ponsFactory_,
        ITokenRegistry registry_,
        address feeVaultImpl_,
        address holderRewardsImpl_,
        address buybackExecutor_,
        address treasury_,
        address ctoManager_
    ) Ownable(owner_) {
        ponsFactory = ponsFactory_;
        registry = registry_;
        feeVaultImpl = feeVaultImpl_;
        holderRewardsImpl = holderRewardsImpl_;
        buybackExecutor = buybackExecutor_;
        treasury = treasury_;
        ctoManager = ctoManager_;
        quotePairAllowed[ETH] = true;
        emit QuotePairSet(ETH, true);
    }

    // ---- Admin (multisig) ----

    function setPlatformFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_PLATFORM_FEE_BPS) revert FeeTooHigh();
        platformFeeBps = bps;
        emit PlatformFeeSet(bps);
    }

    /// @notice Lowest creator tax creators may pick, and the default, for future launches.
    function setCreatorTaxBounds(uint16 minBps, uint16 defaultBps) external onlyOwner {
        uint16 maxBps = maxCreatorTaxBps();
        if (minBps > defaultBps || defaultBps > maxBps) revert CreatorTaxOutOfRange(minBps, maxBps);
        minCreatorTaxBps = minBps;
        defaultCreatorTaxBps = defaultBps;
        emit CreatorTaxBoundsSet(minBps, defaultBps);
    }

    function setLaunchConfigId(uint256 id) external onlyOwner {
        launchConfigId = id;
        emit LaunchConfigIdSet(id);
    }

    /// @notice Non-ETH pairs (USDG, tokenized stocks) need ERC-20 quote handling that is not wired yet,
    ///         so only ETH can be enabled for now.
    function setQuotePair(address quoteAsset, bool allowed) external onlyOwner {
        if (allowed && quoteAsset != ETH) revert QuotePairNotAllowed();
        quotePairAllowed[quoteAsset] = allowed;
        emit QuotePairSet(quoteAsset, allowed);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    // ---- Launch ----

    function defaultFeeConfig() public pure returns (FeeConfig memory) {
        return FeeConfig({buybackBps: DEFAULT_BUYBACK_BPS, rewardBps: DEFAULT_REWARD_BPS});
    }

    /// @notice Highest creator tax a creator may pick: the Pons V2 factory's maximum (10% on mainnet).
    function maxCreatorTaxBps() public view returns (uint16) {
        uint256 max = ponsFactory.maxCreatorTaxBps();
        return max > type(uint16).max ? type(uint16).max : uint16(max);
    }

    /// @notice ETH required on top of any initial buy.
    function launchFee() public view returns (uint256) {
        return ponsFactory.launchFee();
    }

    /// @notice Launch with a custom fee split and creator tax (in bps, between `minCreatorTaxBps` and
    ///         `maxCreatorTaxBps()`). `msg.value` = Pons launch fee + optional initial buy for the creator.
    function launch(
        TokenMeta calldata meta,
        address quotePair,
        bool isMemestock,
        FeeConfig calldata feeConfig,
        uint16 creatorTaxBps
    ) external payable nonReentrant returns (address token, address vault) {
        return _launch(meta, quotePair, isMemestock, feeConfig, creatorTaxBps);
    }

    /// @notice Launch with the default split (40% buyback, 20% rewards, 40% creator) and default creator tax.
    function launchWithDefaultConfig(TokenMeta calldata meta, address quotePair, bool isMemestock)
        external
        payable
        nonReentrant
        returns (address token, address vault)
    {
        return _launch(meta, quotePair, isMemestock, defaultFeeConfig(), defaultCreatorTaxBps);
    }

    function _launch(
        TokenMeta calldata meta,
        address quotePair,
        bool isMemestock,
        FeeConfig memory feeConfig,
        uint16 creatorTaxBps
    ) private returns (address token, address vault) {
        if (paused) revert IsPaused();
        uint16 maxBps = maxCreatorTaxBps();
        if (creatorTaxBps < minCreatorTaxBps || creatorTaxBps > maxBps) {
            revert CreatorTaxOutOfRange(minCreatorTaxBps, maxBps);
        }
        if (!quotePairAllowed[quotePair] || quotePair != ETH) revert QuotePairNotAllowed();
        if (!ponsFactory.launchEnabled()) revert PonsLaunchDisabled();
        uint256 fee = ponsFactory.launchFee();
        if (msg.value < fee) revert InsufficientLaunchFee(fee);

        vault = Clones.clone(feeVaultImpl);
        address rewards = Clones.clone(holderRewardsImpl);

        address curve;
        (token, curve) = _ponsLaunch(meta, vault, creatorTaxBps);

        IHolderRewards(rewards).initialize(token);
        // Reverts on an out-of-bounds feeConfig.
        IFeeVault(vault)
            .initialize(
                VaultWiring({
                    token: token,
                    curve: curve,
                    admin: msg.sender,
                    holderRewards: rewards,
                    buybackExecutor: buybackExecutor,
                    treasury: treasury,
                    ctoManager: ctoManager,
                    ponsFeeEscrow: ponsFactory.feeEscrow(),
                    ponsMemeHook: ponsFactory.memeHook()
                }),
                feeConfig
            );
        registry.register(token, curve, msg.sender, quotePair, isMemestock, vault, rewards);

        emit TokenMetadata(token, meta);
        emit TokenLaunched(token, msg.sender, quotePair, isMemestock, vault);

        uint256 buyAmount = msg.value - fee;
        if (buyAmount > 0) {
            // Same transaction as the launch, so the price cannot move in between.
            uint256 out = IPonsV2Curve(curve).buy{value: buyAmount}(buyAmount, 1, msg.sender);
            emit InitialBuy(token, msg.sender, buyAmount, out);
        }
    }

    function _ponsLaunch(TokenMeta calldata meta, address vault, uint16 creatorTaxBps)
        private
        returns (address token, address curve)
    {
        IPonsV2LaunchFactory.TokenParams memory p;
        p.name = meta.name;
        p.symbol = meta.symbol;
        p.logo = meta.logo;
        p.description = meta.description;
        p.socials.twitter = meta.twitter;
        p.socials.telegram = meta.telegram;
        p.socials.website = meta.website;
        p.creatorFeeRecipient = vault;
        p.creatorTaxBps = creatorTaxBps;
        p.buybackEnabled = false; // Pontoon runs its own buyback-and-burn
        p.expectedEconomics = ponsFactory.previewLaunchEconomics(launchConfigId, ETH);
        p.salt = keccak256(abi.encode(address(this), msg.sender, ++launchCount));

        // The creator's initial buy (recipient = creator) is exempt from the launch snipe tax.
        address[] memory exempt = new address[](1);
        exempt[0] = msg.sender;
        (token, curve) = ponsFactory.launchToken{value: ponsFactory.launchFee()}(p, launchConfigId, ETH, exempt);
    }
}

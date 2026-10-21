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

// src/TokenRegistry.sol

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

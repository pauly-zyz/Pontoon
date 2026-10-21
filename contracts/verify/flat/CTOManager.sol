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

// src/CTOManager.sol

/// @title CTOManager
/// @notice Community takeover: moves FeeVault admin rights to a new team after the multisig
///         approves and a 3-day timelock (mirroring Pons V2) has passed.
/// @dev Flow: anyone requestCTO -> multisig approveCTO -> after eta anyone executeCTO.
///      The current admin, the requester or the multisig can cancel before execution.
contract CTOManager is Ownable {
    uint256 public constant CTO_TIMELOCK = 3 days;

    struct Request {
        address newAdmin;
        address requester;
        uint64 eta;
        bool approved;
    }

    ITokenRegistry public immutable registry;
    mapping(address token => Request) public requests;

    event CTORequested(address indexed token, address indexed newAdmin, uint256 eta);
    event CTOApproved(address indexed token, address indexed newAdmin);
    event CTOExecuted(address indexed token, address indexed oldAdmin, address indexed newAdmin);
    event CTOCancelled(address indexed token);

    error NotRegistered();
    error ZeroAddress();
    error RequestPending();
    error NoRequest();
    error NotApproved();
    error AlreadyApproved();
    error TimelockActive(uint256 eta);
    error NotAuthorized();
    error SameAdmin();

    constructor(address owner_, ITokenRegistry registry_) Ownable(owner_) {
        registry = registry_;
    }

    function requestCTO(address token, address newAdmin) external returns (uint256 eta) {
        if (newAdmin == address(0)) revert ZeroAddress();
        address vault = _vault(token);
        if (IFeeVault(vault).admin() == newAdmin) revert SameAdmin();
        if (requests[token].newAdmin != address(0)) revert RequestPending();
        eta = block.timestamp + CTO_TIMELOCK;
        requests[token] = Request({newAdmin: newAdmin, requester: msg.sender, eta: uint64(eta), approved: false});
        emit CTORequested(token, newAdmin, eta);
    }

    function approveCTO(address token) external onlyOwner {
        Request storage r = requests[token];
        if (r.newAdmin == address(0)) revert NoRequest();
        if (r.approved) revert AlreadyApproved();
        r.approved = true;
        emit CTOApproved(token, r.newAdmin);
    }

    function executeCTO(address token) external {
        Request memory r = requests[token];
        if (r.newAdmin == address(0)) revert NoRequest();
        if (!r.approved) revert NotApproved();
        if (block.timestamp < r.eta) revert TimelockActive(r.eta);
        delete requests[token];
        IFeeVault vault = IFeeVault(_vault(token));
        address oldAdmin = vault.admin();
        vault.setAdmin(r.newAdmin);
        emit CTOExecuted(token, oldAdmin, r.newAdmin);
    }

    function cancelCTO(address token) external {
        Request memory r = requests[token];
        if (r.newAdmin == address(0)) revert NoRequest();
        if (msg.sender != owner() && msg.sender != r.requester && msg.sender != IFeeVault(_vault(token)).admin()) {
            revert NotAuthorized();
        }
        delete requests[token];
        emit CTOCancelled(token);
    }

    function _vault(address token) private view returns (address vault) {
        vault = registry.getToken(token).vault;
        if (vault == address(0)) revert NotRegistered();
    }
}

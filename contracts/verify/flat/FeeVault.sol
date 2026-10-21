// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20 ^0.8.28;

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

// src/FeeVault.sol

/// @title FeeVault
/// @notice One per token (EIP-1167 clone) and the token's Pons V2 creator-fee recipient.
///         distribute() first pulls the fees in (sweeps the curve through the Pons fee harvester and
///         claims from the Pons FeeEscrow), then splits them:
///         caller incentive -> platform fee -> buyback / holder rewards / creator payout.
/// @dev No admin can withdraw buyback or reward funds. Creator payouts are pull-based.
contract FeeVault is ReentrancyGuard {
    // ---- Parameters (spec "Usulan parameter") ----
    uint256 public constant BPS = 10_000;
    uint16 public constant MAX_BUYBACK_BPS = 8_000;
    uint16 public constant MAX_REWARD_BPS = 5_000;
    uint256 public constant CALLER_INCENTIVE_BPS = 50; // 0.5%
    uint256 public constant MAX_CALLER_INCENTIVE = 0.005 ether;
    uint256 public constant CONFIG_TIMELOCK = 24 hours;

    // ---- Wiring (set once at initialize) ----
    address public token;
    address public curve;
    address public admin;
    address public platformConfig; // PontoonLauncher, source of platformFeeBps
    address public holderRewards;
    address public buybackExecutor;
    address public treasury;
    address public ctoManager;
    address public ponsFeeEscrow;
    address public ponsMemeHook;
    bool private _initialized;

    // ---- Config ----
    FeeConfig public config;
    FeeConfig public pendingConfig;
    uint256 public pendingConfigEta; // 0 = nothing queued

    // ---- Creator payouts (pull) ----
    mapping(address => uint256) public creatorOwed;
    uint256 public totalCreatorOwed;

    // ---- Stats ----
    uint256 public totalReceived;
    uint256 public totalDistributed;

    event FeeReceived(address indexed token, uint256 amount);
    event FeeDistributed(
        address indexed token, uint256 platform, uint256 creator, uint256 buyback, uint256 rewards, address caller
    );
    event CallerIncentivePaid(address indexed token, address indexed caller, uint256 amount);
    event ConfigQueued(address indexed token, FeeConfig newConfig, uint256 eta);
    event ConfigApplied(address indexed token, FeeConfig newConfig);
    event ConfigCancelled(address indexed token);
    event CreatorClaimed(address indexed token, address indexed account, uint256 amount);
    event AdminChanged(address indexed token, address indexed oldAdmin, address indexed newAdmin);
    event FeesCollected(address indexed token, bool harvested, uint256 claimed);

    error AlreadyInitialized();
    error NotAdmin();
    error NotCTOManager();
    error InvalidConfig();
    error NothingToDistribute();
    error NothingQueued();
    error TimelockActive(uint256 eta);
    error NothingToClaim();
    error TransferFailed();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() {
        // Lock the implementation; only clones get initialized.
        _initialized = true;
    }

    function initialize(VaultWiring calldata w, FeeConfig calldata config_) external {
        if (_initialized) revert AlreadyInitialized();
        if (
            w.token == address(0) || w.curve == address(0) || w.admin == address(0) || w.holderRewards == address(0)
                || w.buybackExecutor == address(0) || w.treasury == address(0) || w.ctoManager == address(0)
                || w.ponsFeeEscrow == address(0) || w.ponsMemeHook == address(0)
        ) revert ZeroAddress();
        validateConfig(config_);
        _initialized = true;
        token = w.token;
        curve = w.curve;
        admin = w.admin;
        platformConfig = msg.sender;
        holderRewards = w.holderRewards;
        buybackExecutor = w.buybackExecutor;
        treasury = w.treasury;
        ctoManager = w.ctoManager;
        ponsFeeEscrow = w.ponsFeeEscrow;
        ponsMemeHook = w.ponsMemeHook;
        config = config_;
        emit ConfigApplied(w.token, config_);
    }

    receive() external payable {
        totalReceived += msg.value;
        emit FeeReceived(token, msg.value);
    }

    // ------------------------------------------------------------------
    // Distribution
    // ------------------------------------------------------------------

    /// @notice ETH currently waiting to be distributed (excludes unclaimed creator payouts).
    ///         Does not include fees still held by Pons; see claimableFromPons().
    function pendingDistribution() public view returns (uint256) {
        return address(this).balance - totalCreatorOwed;
    }

    /// @notice Creator fees Pons has already credited to this vault in its FeeEscrow.
    ///         Fees still inside the curve (not yet swept) are not included.
    function claimableFromPons() public view returns (uint256) {
        return IPonsV2FeeEscrow(ponsFeeEscrow).balanceOf(address(this));
    }

    /// @notice Permissionless. Pulls this token's creator fees from Pons into the vault:
    ///         sweeps the curve via the Pons fee harvester, then claims from the FeeEscrow.
    ///         Never reverts, so a Pons-side hiccup cannot block distributing what is already here.
    function collectFees() public returns (uint256 claimed) {
        bool harvested = PonsV2Raw.harvest(PonsV2Raw.feeHarvester(ponsMemeHook), curve);
        IPonsV2FeeEscrow escrow = IPonsV2FeeEscrow(ponsFeeEscrow);
        try escrow.balanceOf(address(this)) returns (uint256 credited) {
            if (credited > 0) {
                try escrow.claim() returns (uint256 amount) {
                    claimed = amount;
                } catch {}
            }
        } catch {}
        emit FeesCollected(token, harvested, claimed);
    }

    /// @notice Preview how `amount` would be split under the active config.
    function previewSplit(uint256 amount)
        public
        view
        returns (uint256 incentive, uint256 platform, uint256 creator, uint256 buyback, uint256 rewards)
    {
        incentive = amount * CALLER_INCENTIVE_BPS / BPS;
        if (incentive > MAX_CALLER_INCENTIVE) incentive = MAX_CALLER_INCENTIVE;
        uint256 rest = amount - incentive;
        platform = rest * IPlatformConfig(platformConfig).platformFeeBps() / BPS;
        uint256 remainder = rest - platform;
        FeeConfig memory c = config;
        buyback = remainder * c.buybackBps / BPS;
        rewards = remainder * c.rewardBps / BPS;
        creator = remainder - buyback - rewards;
    }

    /// @notice Permissionless. Pulls fees from Pons, splits all pending ETH and pays the caller a small incentive.
    function distribute() external nonReentrant {
        collectFees();
        uint256 amount = pendingDistribution();
        if (amount == 0) revert NothingToDistribute();

        (uint256 incentive, uint256 platform, uint256 creator, uint256 buyback, uint256 rewards) = previewSplit(amount);

        totalDistributed += amount;
        if (creator > 0) {
            creatorOwed[admin] += creator;
            totalCreatorOwed += creator;
        }

        if (platform > 0) _send(treasury, platform);
        if (buyback > 0) IBuybackExecutor(buybackExecutor).depositFor{value: buyback}(token);
        if (rewards > 0) IHolderRewards(holderRewards).notifyReward{value: rewards}();
        if (incentive > 0) {
            _send(msg.sender, incentive);
            emit CallerIncentivePaid(token, msg.sender, incentive);
        }

        emit FeeDistributed(token, platform, creator, buyback, rewards, msg.sender);
    }

    /// @notice Pull the creator payout owed to msg.sender. Works for past admins too,
    ///         so a CTO never confiscates payouts that were already earned.
    function claimCreator() external nonReentrant returns (uint256 amount) {
        amount = creatorOwed[msg.sender];
        if (amount == 0) revert NothingToClaim();
        creatorOwed[msg.sender] = 0;
        totalCreatorOwed -= amount;
        _send(msg.sender, amount);
        emit CreatorClaimed(token, msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Config (24h timelock)
    // ------------------------------------------------------------------

    function validateConfig(FeeConfig memory c) public pure {
        if (c.buybackBps > MAX_BUYBACK_BPS || c.rewardBps > MAX_REWARD_BPS) revert InvalidConfig();
        if (uint256(c.buybackBps) + c.rewardBps > BPS) revert InvalidConfig();
    }

    function queueConfig(FeeConfig calldata newConfig) external onlyAdmin {
        validateConfig(newConfig);
        uint256 eta = block.timestamp + CONFIG_TIMELOCK;
        pendingConfig = newConfig;
        pendingConfigEta = eta;
        emit ConfigQueued(token, newConfig, eta);
    }

    /// @notice Permissionless once the timelock has passed.
    function applyConfig() external {
        uint256 eta = pendingConfigEta;
        if (eta == 0) revert NothingQueued();
        if (block.timestamp < eta) revert TimelockActive(eta);
        FeeConfig memory c = pendingConfig;
        config = c;
        delete pendingConfig;
        pendingConfigEta = 0;
        emit ConfigApplied(token, c);
    }

    function cancelConfig() external onlyAdmin {
        if (pendingConfigEta == 0) revert NothingQueued();
        delete pendingConfig;
        pendingConfigEta = 0;
        emit ConfigCancelled(token);
    }

    // ------------------------------------------------------------------
    // CTO
    // ------------------------------------------------------------------

    /// @notice Only CTOManager, after its own 3-day timelock. Drops any config queued by the old admin.
    function setAdmin(address newAdmin) external {
        if (msg.sender != ctoManager) revert NotCTOManager();
        if (newAdmin == address(0)) revert ZeroAddress();
        address old = admin;
        admin = newAdmin;
        if (pendingConfigEta != 0) {
            delete pendingConfig;
            pendingConfigEta = 0;
            emit ConfigCancelled(token);
        }
        emit AdminChanged(token, old, newAdmin);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}

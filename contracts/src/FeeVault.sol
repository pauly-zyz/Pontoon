// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FeeConfig, IPlatformConfig, IHolderRewards, IBuybackExecutor, VaultWiring} from "./interfaces/IPontoon.sol";
import {IPonsV2FeeEscrow, PonsV2Raw} from "./interfaces/IPonsV2Live.sol";

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

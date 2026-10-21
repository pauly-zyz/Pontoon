// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    FeeConfig,
    IFeeVault,
    IHolderRewards,
    IPlatformConfig,
    ITokenRegistry,
    VaultWiring
} from "./interfaces/IPontoon.sol";
import {IPonsV2Curve, IPonsV2LaunchFactory} from "./interfaces/IPonsV2Live.sol";

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
    /// @notice Pons creator tax every Pontoon token is launched with (paid on curve trades into the FeeVault).
    uint16 public creatorTaxBps = 300;
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
    event CreatorTaxSet(uint16 bps);
    event LaunchConfigIdSet(uint256 id);
    event QuotePairSet(address indexed quoteAsset, bool allowed);
    event Paused(bool paused);

    error IsPaused();
    error QuotePairNotAllowed();
    error FeeTooHigh();
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

    /// @notice Creator tax for future launches, capped by the Pons factory's maximum.
    function setCreatorTaxBps(uint16 bps) external onlyOwner {
        if (bps > ponsFactory.maxCreatorTaxBps()) revert FeeTooHigh();
        creatorTaxBps = bps;
        emit CreatorTaxSet(bps);
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

    /// @notice ETH required on top of any initial buy.
    function launchFee() public view returns (uint256) {
        return ponsFactory.launchFee();
    }

    /// @notice Launch with a custom fee split. `msg.value` = Pons launch fee + optional initial buy for the creator.
    function launch(TokenMeta calldata meta, address quotePair, bool isMemestock, FeeConfig calldata feeConfig)
        external
        payable
        nonReentrant
        returns (address token, address vault)
    {
        return _launch(meta, quotePair, isMemestock, feeConfig);
    }

    /// @notice Launch with the default split (40% buyback, 20% rewards, 40% creator).
    function launchWithDefaultConfig(TokenMeta calldata meta, address quotePair, bool isMemestock)
        external
        payable
        nonReentrant
        returns (address token, address vault)
    {
        return _launch(meta, quotePair, isMemestock, defaultFeeConfig());
    }

    function _launch(TokenMeta calldata meta, address quotePair, bool isMemestock, FeeConfig memory feeConfig)
        private
        returns (address token, address vault)
    {
        if (paused) revert IsPaused();
        if (!quotePairAllowed[quotePair] || quotePair != ETH) revert QuotePairNotAllowed();
        if (!ponsFactory.launchEnabled()) revert PonsLaunchDisabled();
        uint256 fee = ponsFactory.launchFee();
        if (msg.value < fee) revert InsufficientLaunchFee(fee);

        vault = Clones.clone(feeVaultImpl);
        address rewards = Clones.clone(holderRewardsImpl);

        address curve;
        (token, curve) = _ponsLaunch(meta, vault);

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

    function _ponsLaunch(TokenMeta calldata meta, address vault) private returns (address token, address curve) {
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

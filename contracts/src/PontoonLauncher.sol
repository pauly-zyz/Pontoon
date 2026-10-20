// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FeeConfig, IFeeVault, IHolderRewards, IPlatformConfig, ITokenRegistry} from "./interfaces/IPontoon.sol";
import {IPonsV2Factory} from "./interfaces/IPonsV2.sol";

/// @title PontoonLauncher
/// @notice Entry point for launches. Clones a FeeVault + HolderRewards per token, creates the token
///         on Pons V2 with the FeeVault as creator-fee recipient, and registers it.
///         Also holds the global platform fee that every FeeVault reads.
contract PontoonLauncher is IPlatformConfig, Ownable, ReentrancyGuard {
    uint16 public constant MAX_PLATFORM_FEE_BPS = 3_000;
    uint16 public constant DEFAULT_BUYBACK_BPS = 4_000;
    uint16 public constant DEFAULT_REWARD_BPS = 2_000;

    struct TokenMeta {
        string name;
        string symbol;
        string metadataURI; // image, description, socials (off-chain JSON)
    }

    IPonsV2Factory public immutable ponsFactory;
    ITokenRegistry public immutable registry;
    address public immutable feeVaultImpl;
    address public immutable holderRewardsImpl;
    address public immutable buybackExecutor;
    address public immutable treasury;
    address public immutable ctoManager;

    uint16 public platformFeeBps = 2_000;
    bool public paused;
    /// @notice Allowed quote pairs. address(0) = ETH.
    mapping(address => bool) public quotePairAllowed;

    event TokenLaunched(
        address indexed token, address indexed creator, address quotePair, bool isMemestock, address vault
    );
    /// @notice Name, ticker and off-chain metadata (image, description, socials) for the indexer.
    event TokenMetadata(address indexed token, string name, string symbol, string metadataURI);
    event PlatformFeeSet(uint16 bps);
    event QuotePairSet(address indexed quoteAsset, bool allowed);
    event Paused(bool paused);

    error IsPaused();
    error QuotePairNotAllowed();
    error FeeTooHigh();

    constructor(
        address owner_,
        IPonsV2Factory ponsFactory_,
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
        quotePairAllowed[address(0)] = true;
        emit QuotePairSet(address(0), true);
    }

    // ---- Admin (multisig) ----

    function setPlatformFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_PLATFORM_FEE_BPS) revert FeeTooHigh();
        platformFeeBps = bps;
        emit PlatformFeeSet(bps);
    }

    function setQuotePair(address quoteAsset, bool allowed) external onlyOwner {
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

    /// @notice Launch with a custom fee split. `msg.value` is forwarded as the creator's initial buy.
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
        if (!quotePairAllowed[quotePair]) revert QuotePairNotAllowed();

        vault = Clones.clone(feeVaultImpl);
        address rewards = Clones.clone(holderRewardsImpl);

        token = ponsFactory.createToken{value: msg.value}(
            IPonsV2Factory.CreateParams({
                name: meta.name,
                symbol: meta.symbol,
                metadataURI: meta.metadataURI,
                quoteAsset: quotePair,
                feeRecipient: vault,
                initialBuyRecipient: msg.sender
            })
        );

        IHolderRewards(rewards).initialize(token);
        // Reverts on an out-of-bounds feeConfig.
        IFeeVault(vault).initialize(token, msg.sender, rewards, buybackExecutor, treasury, ctoManager, feeConfig);
        registry.register(token, msg.sender, quotePair, isMemestock, vault, rewards);

        emit TokenMetadata(token, meta.name, meta.symbol, meta.metadataURI);
        emit TokenLaunched(token, msg.sender, quotePair, isMemestock, vault);
    }
}

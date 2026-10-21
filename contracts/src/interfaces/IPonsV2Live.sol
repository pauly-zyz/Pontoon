// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

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
    function creatorTaxBps() external view returns (uint16);
    function launchedAt() external view returns (uint256);
    function graduationThreshold() external view returns (uint256);
}

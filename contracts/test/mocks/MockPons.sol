// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPonsV2Factory, ISwapRoute} from "../../src/interfaces/IPonsV2.sol";

contract MockToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Stand-in for the Pons V2 factory. Also lets tests simulate creator-fee payments.
contract MockPonsFactory is IPonsV2Factory {
    uint256 public constant INITIAL_BUY_RATE = 1_000; // tokens per wei of initial buy

    mapping(address => address) public feeRecipientOf;
    mapping(address => address) public quoteAssetOf;
    mapping(address => bool) public isGraduated;

    function createToken(CreateParams calldata p) external payable returns (address token) {
        MockToken t = new MockToken(p.name, p.symbol);
        token = address(t);
        feeRecipientOf[token] = p.feeRecipient;
        quoteAssetOf[token] = p.quoteAsset;
        if (msg.value > 0) t.mint(p.initialBuyRecipient, msg.value * INITIAL_BUY_RATE);
    }

    function setGraduated(address token, bool g) external {
        isGraduated[token] = g;
        if (g) emit Graduated(token);
    }

    /// @dev Emits a Trade like Pons V2 would; used by the local demo to feed the indexer.
    function recordTrade(address token, address trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount) external {
        emit Trade(token, trader, isBuy, ethAmount, tokenAmount);
    }

    /// @dev Simulates Pons V2 sending the creator share of trading fees.
    function payCreatorFee(address token) external payable {
        (bool ok,) = feeRecipientOf[token].call{value: msg.value}("");
        require(ok, "fee send failed");
    }
}

/// @dev Stand-in for the Pons curve router and the Uniswap V4 adapter.
contract MockRouter is ISwapRoute {
    uint256 public rate = 1_000e18; // tokens out per 1 ETH (1e18 scale)
    mapping(address => uint256) public liquidity;
    uint256 public calls;
    address public lastQuote;

    function setRate(uint256 r) external {
        rate = r;
    }

    function setLiquidity(address token, uint256 l) external {
        liquidity[token] = l;
    }

    function swapExactETHForTokens(address token, address quoteAsset, uint256 minOut, address recipient)
        external
        payable
        returns (uint256 out)
    {
        out = msg.value * rate / 1e18;
        require(out >= minOut, "router: slippage");
        calls++;
        lastQuote = quoteAsset;
        MockToken(token).mint(recipient, out);
    }

    function ethLiquidity(address token, address) external view returns (uint256) {
        return liquidity[token];
    }
}

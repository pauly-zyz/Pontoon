// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPonsV2Curve, IPonsV2FeeEscrow, IPonsV2LaunchFactory, PonsV2Raw} from "../../src/interfaces/IPonsV2Live.sol";

// Unit-test doubles that mirror the live Pons V2 behaviour measured on a mainnet fork:
// - creator tax + 70% of the 1% curve fee accrue inside the curve,
// - only the fee harvester (looked up on the MemeHook) can sweep them into the FeeEscrow,
// - recipients pull ETH from the FeeEscrow with claim().
// See test/fork/ for the same flows against the real contracts.

contract MockToken is ERC20 {
    constructor(string memory n, string memory s, address to, uint256 supply) ERC20(n, s) {
        _mint(to, supply);
    }

    /// @dev Test helper.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockFeeEscrow is IPonsV2FeeEscrow {
    mapping(address => uint256) public balanceOf;

    function credit(address recipient) external payable {
        balanceOf[recipient] += msg.value;
        emit Credited(recipient, msg.sender, msg.value);
    }

    function claim() external returns (uint256 amount) {
        amount = balanceOf[msg.sender];
        require(amount > 0, "NoBalance");
        balanceOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "TransferFailed");
        emit Claimed(msg.sender, amount);
    }
}

/// @dev Answers the live MemeHook selector 0x8a36a6bb with the harvester address.
contract MockMemeHook {
    address public immutable harvester;

    constructor(address harvester_) {
        harvester = harvester_;
    }

    fallback(bytes calldata) external returns (bytes memory) {
        require(msg.sig == PonsV2Raw.MEME_HOOK_FEE_HARVESTER, "unknown selector");
        return abi.encode(harvester);
    }
}

/// @dev Answers the live harvester selector 0xe6b71b11(curve) by sweeping that curve. Permissionless.
contract MockHarvester {
    fallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sig == PonsV2Raw.HARVESTER_HARVEST, "unknown selector");
        address curve = abi.decode(data[4:], (address));
        MockCurve(payable(curve)).sweep();
        return "";
    }
}

contract MockCurve is IPonsV2Curve {
    uint256 public constant CURVE_FEE_BPS = 100;
    uint256 public constant PHANTOM = 1.68 ether;

    address public immutable factory;
    address public token;
    address public immutable feeRecipient;
    address public immutable protocolRecipient;
    MockFeeEscrow public immutable escrow;
    address public immutable harvester;
    uint16 public immutable creatorTaxBps;
    uint256 public immutable launchedAt;
    uint256 public graduationThreshold = 4.2 ether;

    uint256 public realQuoteReserve;
    bool public graduated;
    uint256 public pendingCreatorFees;
    uint256 public pendingProtocolFees;

    constructor(
        address feeRecipient_,
        address protocolRecipient_,
        MockFeeEscrow escrow_,
        address harvester_,
        uint16 creatorTaxBps_
    ) {
        factory = msg.sender;
        feeRecipient = feeRecipient_;
        protocolRecipient = protocolRecipient_;
        escrow = escrow_;
        harvester = harvester_;
        creatorTaxBps = creatorTaxBps_;
        launchedAt = block.timestamp;
    }

    function setToken(address token_) external {
        require(msg.sender == factory && token == address(0));
        token = token_;
    }

    function pairToken() external pure returns (address) {
        return address(0);
    }

    function quoteReserve() public view returns (uint256) {
        return PHANTOM + realQuoteReserve;
    }

    function tokenReserve() public view returns (uint256) {
        return ERC20(token).balanceOf(address(this));
    }

    function _fees(uint256 amount) internal view returns (uint256 curveFee, uint256 tax) {
        curveFee = amount * CURVE_FEE_BPS / 10_000;
        tax = amount * creatorTaxBps / 10_000;
    }

    function _accrue(uint256 curveFee, uint256 tax) internal {
        uint256 creatorShare = curveFee * 70 / 100;
        pendingCreatorFees += tax + creatorShare;
        pendingProtocolFees += curveFee - creatorShare;
    }

    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256 out) {
        require(!graduated, "graduated");
        require(msg.value == quoteIn && quoteIn > 0, "value");
        (uint256 curveFee, uint256 tax) = _fees(quoteIn);
        uint256 net = quoteIn - curveFee - tax;
        out = tokenReserve() * net / (quoteReserve() + net);
        require(out >= minTokensOut, "slippage");
        realQuoteReserve += net;
        _accrue(curveFee, tax);
        ERC20(token).transfer(recipient, out);
        emit CurveBuy(msg.sender, recipient, quoteIn, out, curveFee, tax);
        if (realQuoteReserve >= graduationThreshold) _graduate();
    }

    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) external returns (uint256 out) {
        require(!graduated, "graduated");
        uint256 gross = quoteReserve() * tokensIn / (tokenReserve() + tokensIn);
        if (gross > realQuoteReserve) gross = realQuoteReserve;
        ERC20(token).transferFrom(msg.sender, address(this), tokensIn);
        (uint256 curveFee, uint256 tax) = _fees(gross);
        out = gross - curveFee - tax;
        require(out >= minQuoteOut, "slippage");
        realQuoteReserve -= gross;
        _accrue(curveFee, tax);
        (bool ok,) = recipient.call{value: out}("");
        require(ok, "send");
        emit CurveSell(msg.sender, recipient, tokensIn, out, curveFee, tax);
    }

    function sweep() external {
        require(msg.sender == harvester, "only harvester");
        uint256 c = pendingCreatorFees;
        uint256 p = pendingProtocolFees;
        pendingCreatorFees = 0;
        pendingProtocolFees = 0;
        if (c > 0) escrow.credit{value: c}(feeRecipient);
        if (p > 0) escrow.credit{value: p}(protocolRecipient);
    }

    /// @dev Test helper: force graduation (as if the curve filled up).
    function forceGraduate() external {
        _graduate();
    }

    function _graduate() internal {
        if (graduated) return;
        graduated = true;
        MockPonsFactory(payable(factory)).onGraduated(token);
    }
}

contract MockPonsFactory is IPonsV2LaunchFactory {
    uint256 public launchFee = 0.0005 ether;
    uint256 public maxCreatorTaxBps = 1000;
    bool public launchEnabled = true;
    uint256 public snipeTaxStartBps = 9900;
    uint256 public snipeTaxSeconds = 3;
    address public immutable protocolRecipient = address(0xFEE5);

    MockFeeEscrow public immutable escrow;
    MockHarvester public immutable harvester;
    MockMemeHook public immutable hook;

    mapping(address => LaunchedToken) internal _launched;
    address[] public exemptionsSeen;

    constructor() {
        escrow = new MockFeeEscrow();
        harvester = new MockHarvester();
        hook = new MockMemeHook(address(harvester));
    }

    function feeEscrow() external view returns (address) {
        return address(escrow);
    }

    function memeHook() external view returns (address) {
        return address(hook);
    }

    function canLaunch(address) external view returns (bool) {
        return launchEnabled;
    }

    function setLaunchEnabled(bool e) external {
        launchEnabled = e;
    }

    function setLaunchFee(uint256 f) external {
        launchFee = f;
    }

    function previewLaunchEconomics(uint256 id, address pairToken) public pure returns (bytes32) {
        return keccak256(abi.encode("economics", id, pairToken));
    }

    function launchToken(TokenParams calldata params, uint256 launchConfigId, address pairToken)
        external
        payable
        returns (address token, address curve)
    {
        return _launch(params, launchConfigId, pairToken);
    }

    function launchToken(
        TokenParams calldata params,
        uint256 launchConfigId,
        address pairToken,
        address[] calldata snipeTaxExemptions
    ) external payable returns (address token, address curve) {
        for (uint256 i; i < snipeTaxExemptions.length; i++) {
            exemptionsSeen.push(snipeTaxExemptions[i]);
        }
        return _launch(params, launchConfigId, pairToken);
    }

    function _launch(TokenParams calldata params, uint256 launchConfigId, address pairToken)
        internal
        returns (address token, address curve)
    {
        require(launchEnabled, "LaunchDisabled");
        require(msg.value == launchFee, "LaunchFeeNotPaid");
        require(params.creatorTaxBps <= maxCreatorTaxBps, "CreatorTaxTooHigh");
        require(params.expectedEconomics == previewLaunchEconomics(launchConfigId, pairToken), "EconomicsMismatch");
        MockCurve c = new MockCurve(
            params.creatorFeeRecipient, protocolRecipient, escrow, address(harvester), params.creatorTaxBps
        );
        MockToken t = new MockToken(params.name, params.symbol, address(c), 1e27);
        c.setToken(address(t));
        token = address(t);
        curve = address(c);
        LaunchedToken storage l = _launched[token];
        l.token = token;
        l.curve = curve;
        l.deployer = msg.sender;
        l.creatorFeeRecipient = params.creatorFeeRecipient;
        l.pairToken = pairToken;
        l.graduationThreshold = 4.2 ether;
        l.creatorTaxBps = params.creatorTaxBps;
        l.buybackEnabled = params.buybackEnabled;
        l.exists = true;
        emit TokenLaunched(token, curve, msg.sender, pairToken, launchConfigId, 4.2 ether);
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory) {
        return _launched[token];
    }

    function onGraduated(address token) external {
        require(msg.sender == _launched[token].curve, "only curve");
        _launched[token].phase = 2;
        emit PoolGraduated(token, 1, 0, 0);
    }

    /// @dev Test helper: credit creator fees for a token as the MemeHook does after graduation.
    function creditCreatorFee(address token) external payable {
        escrow.credit{value: msg.value}(_launched[token].creatorFeeRecipient);
    }

    function exemptionsCount() external view returns (uint256) {
        return exemptionsSeen.length;
    }
}

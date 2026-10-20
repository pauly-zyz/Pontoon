// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PlatformTreasury
/// @notice Collects the platform fee. Withdrawals require the multisig owner and a timelock.
contract PlatformTreasury is Ownable, ReentrancyGuard {
    uint256 public constant WITHDRAW_DELAY = 48 hours;

    struct Withdrawal {
        address to;
        uint256 amount;
        uint64 eta;
        bool executed;
        bool cancelled;
    }

    Withdrawal[] public withdrawals;
    uint256 public totalReceived;

    event PlatformFeeReceived(address indexed from, uint256 amount);
    event WithdrawQueued(uint256 indexed id, address indexed to, uint256 amount, uint256 eta);
    event WithdrawExecuted(uint256 indexed id, address indexed to, uint256 amount);
    event WithdrawCancelled(uint256 indexed id);

    error ZeroAddress();
    error UnknownWithdrawal();
    error NotQueued();
    error TimelockActive(uint256 eta);
    error TransferFailed();

    constructor(address owner_) Ownable(owner_) {}

    receive() external payable {
        totalReceived += msg.value;
        emit PlatformFeeReceived(msg.sender, msg.value);
    }

    function queueWithdraw(address to, uint256 amount) external onlyOwner returns (uint256 id) {
        if (to == address(0)) revert ZeroAddress();
        id = withdrawals.length;
        uint64 eta = uint64(block.timestamp + WITHDRAW_DELAY);
        withdrawals.push(Withdrawal({to: to, amount: amount, eta: eta, executed: false, cancelled: false}));
        emit WithdrawQueued(id, to, amount, eta);
    }

    function withdraw(uint256 id) external onlyOwner nonReentrant {
        Withdrawal storage w = _get(id);
        if (block.timestamp < w.eta) revert TimelockActive(w.eta);
        w.executed = true;
        (bool ok,) = w.to.call{value: w.amount}("");
        if (!ok) revert TransferFailed();
        emit WithdrawExecuted(id, w.to, w.amount);
    }

    function cancelWithdraw(uint256 id) external onlyOwner {
        _get(id).cancelled = true;
        emit WithdrawCancelled(id);
    }

    function withdrawalCount() external view returns (uint256) {
        return withdrawals.length;
    }

    function _get(uint256 id) private view returns (Withdrawal storage w) {
        if (id >= withdrawals.length) revert UnknownWithdrawal();
        w = withdrawals[id];
        if (w.executed || w.cancelled) revert NotQueued();
    }
}

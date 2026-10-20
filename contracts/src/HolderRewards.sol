// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title HolderRewards
/// @notice One per token (EIP-1167 clone). Holders stake the token and earn ETH using a
///         reward-per-share accumulator. Only stakers earn, so LP pools and the burn address
///         are excluded automatically.
/// @dev No admin and no withdraw function: ETH can only leave via claim().
contract HolderRewards is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant PRECISION = 1e24;

    IERC20 public stakingToken;
    bool private _initialized;

    uint256 public totalStaked;
    uint256 public accRewardPerShare;
    /// @notice ETH received while nobody was staked; released on the next notify with stakers.
    uint256 public queuedRewards;
    uint256 public totalRewardsNotified;

    mapping(address => uint256) public stakedOf;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public owed;

    event Staked(address indexed token, address indexed user, uint256 amount);
    event Unstaked(address indexed token, address indexed user, uint256 amount);
    event RewardClaimed(address indexed token, address indexed user, uint256 amount);
    event RewardNotified(address indexed token, uint256 amount, uint256 released);

    error AlreadyInitialized();
    error ZeroAmount();
    error InsufficientStake();
    error NothingToClaim();
    error TransferFailed();

    constructor() {
        _initialized = true;
    }

    function initialize(address token_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        stakingToken = IERC20(token_);
    }

    /// @notice Anyone may add ETH rewards (FeeVault does so on distribute()).
    function notifyReward() external payable {
        totalRewardsNotified += msg.value;
        uint256 amount = queuedRewards + msg.value;
        if (totalStaked == 0) {
            queuedRewards = amount;
            emit RewardNotified(address(stakingToken), msg.value, 0);
            return;
        }
        queuedRewards = 0;
        accRewardPerShare += amount * PRECISION / totalStaked;
        emit RewardNotified(address(stakingToken), msg.value, amount);
    }

    function pendingReward(address user) public view returns (uint256) {
        return owed[user] + stakedOf[user] * accRewardPerShare / PRECISION - rewardDebt[user];
    }

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _settle(msg.sender);
        uint256 before = stakingToken.balanceOf(address(this));
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = stakingToken.balanceOf(address(this)) - before;
        stakedOf[msg.sender] += received;
        totalStaked += received;
        rewardDebt[msg.sender] = stakedOf[msg.sender] * accRewardPerShare / PRECISION;
        emit Staked(address(stakingToken), msg.sender, received);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (stakedOf[msg.sender] < amount) revert InsufficientStake();
        _settle(msg.sender);
        stakedOf[msg.sender] -= amount;
        totalStaked -= amount;
        rewardDebt[msg.sender] = stakedOf[msg.sender] * accRewardPerShare / PRECISION;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(address(stakingToken), msg.sender, amount);
    }

    function claim() external nonReentrant returns (uint256 amount) {
        _settle(msg.sender);
        amount = owed[msg.sender];
        if (amount == 0) revert NothingToClaim();
        owed[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit RewardClaimed(address(stakingToken), msg.sender, amount);
    }

    function _settle(address user) private {
        uint256 accumulated = stakedOf[user] * accRewardPerShare / PRECISION;
        owed[user] += accumulated - rewardDebt[user];
        rewardDebt[user] = accumulated;
    }
}

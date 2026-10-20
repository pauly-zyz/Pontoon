// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IFeeVault, ITokenRegistry} from "./interfaces/IPontoon.sol";

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

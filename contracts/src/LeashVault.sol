// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IReputationOracle} from "./interfaces/IReputationOracle.sol";

/// @title LeashVault
/// @notice An onchain firewall wallet for an AI agent.
///
///         A human `owner` funds the vault with a stablecoin and sets a spending policy.
///         A single `agent` address (the AI's hot key) may only move funds by calling `pay`.
///         Every payment is checked against the policy *by the contract*, so even a
///         prompt-injected or fully compromised agent cannot overspend or pay an untrusted
///         address.
///
///         Policy checks, in order (the first failure wins):
///           1. vault is paused                                  -> VAULT_PAUSED
///           2. amount is 0, or recipient is 0x0 / the vault      -> INVALID_PAYMENT
///           3. amount > perTxCap                                -> EXCEEDS_PER_TX_CAP
///           4. spentToday + amount > dailyCap                   -> EXCEEDS_DAILY_CAP
///           5. recipient not allowlisted and reputation too low  -> LOW_REPUTATION
///           6. vault balance < amount                           -> INSUFFICIENT_BALANCE
///
///         A blocked payment does NOT revert: it emits `PaymentBlocked` so the attempt is
///         recorded onchain for the dashboard. A payment that passes every check but is
///         larger than `approvalThreshold` becomes a pending request that the owner must
///         approve before any funds move.
/// @dev Only owner functions (and `pay` called by a non-agent) revert, using custom errors.
contract LeashVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice The spending rules the owner sets for the agent. Amounts use token units
    ///         (for a 6-decimal stablecoin, 1 USDC = 1_000_000).
    /// @param perTxCap Largest amount a single payment may have.
    /// @param dailyCap Largest total the agent may spend per UTC day (executed + approved).
    /// @param approvalThreshold Payments strictly above this need the owner's approval.
    /// @param minReputation Minimum oracle score (0-100) for recipients that are not allowlisted.
    /// @param approvalTTL Seconds a pending request stays approvable after it is created.
    struct Policy {
        uint256 perTxCap;
        uint256 dailyCap;
        uint256 approvalThreshold;
        uint8 minReputation;
        uint64 approvalTTL;
    }

    /// @notice Lifecycle of a payment that needs the owner's approval.
    enum RequestStatus {
        Pending,
        Approved,
        Denied,
        Expired
    }

    /// @notice A payment waiting for (or resolved by) the owner.
    /// @param to Recipient.
    /// @param amount Amount in token units.
    /// @param memo The agent's free-text reason for paying.
    /// @param createdAt Timestamp the agent requested the payment.
    /// @param expiresAt Last timestamp at which the owner can still approve it.
    /// @param status Current status.
    struct Request {
        address to;
        uint256 amount;
        string memo;
        uint64 createdAt;
        uint64 expiresAt;
        RequestStatus status;
    }

    /// @notice Outcome of a `pay` call (returned as `uint8`).
    enum PayResult {
        Executed,
        Pending,
        Blocked
    }

    /// @notice Why a payment was blocked. `NONE` means it passed every check.
    /// @dev Member names match the `reasonText` strings emitted in `PaymentBlocked`.
    enum ReasonCode {
        NONE,
        VAULT_PAUSED,
        INVALID_PAYMENT,
        EXCEEDS_PER_TX_CAP,
        EXCEEDS_DAILY_CAP,
        LOW_REPUTATION,
        INSUFFICIENT_BALANCE
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice The stablecoin this vault holds and pays out.
    IERC20 public immutable token;

    /// @notice The only address allowed to call `pay` (the AI agent's key).
    address public agent;

    /// @notice Source of recipient reputation scores (0-100).
    IReputationOracle public reputationOracle;

    /// @notice Kill switch. While true, every payment and approval is refused.
    bool public paused;

    /// @notice Recipients the owner trusts outright. They skip the reputation check,
    ///         but all other checks (caps, pause, balance, approval) still apply.
    mapping(address account => bool allowed) public allowlist;

    /// @notice Amount spent (executed + approved) per day index (`block.timestamp / 1 days`).
    mapping(uint256 day => uint256 amount) public spentOnDay;

    /// @notice Number of approval requests ever created. Request IDs run from 1 to this value.
    uint256 public requestCount;

    /// @notice Total amount ever paid out to recipients via `pay` or `approveRequest`.
    /// @dev Owner withdrawals are not included.
    uint256 public totalPaid;

    /// @notice Number of payment attempts the policy has blocked.
    uint256 public totalBlocked;

    /// @dev Current spending policy. Read via `getPolicy()`.
    Policy private _policy;

    /// @dev Approval requests by ID (1-based).
    mapping(uint256 id => Request) private _requests;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice A payment passed every check and was sent immediately.
    event PaymentExecuted(address indexed to, uint256 amount, string memo);

    /// @notice A payment was refused by the policy. No funds moved.
    /// @param reasonCode Machine-readable reason.
    /// @param reasonText Human-readable reason, e.g. "LOW_REPUTATION".
    event PaymentBlocked(
        address indexed to, uint256 amount, ReasonCode indexed reasonCode, string reasonText, string memo
    );

    /// @notice A payment passed every check but exceeds `approvalThreshold`; it awaits the owner.
    event PaymentPending(uint256 indexed requestId, address indexed to, uint256 amount, string memo);

    /// @notice The owner approved a pending request and the funds were sent.
    event PaymentApproved(uint256 indexed requestId, address indexed to, uint256 amount);

    /// @notice The owner denied a pending request. No funds moved.
    event PaymentDenied(uint256 indexed requestId, address indexed to, uint256 amount);

    /// @notice A pending request passed its TTL and can no longer be approved.
    event PaymentExpired(uint256 indexed requestId, address indexed to, uint256 amount);

    /// @notice The owner changed the spending policy.
    event PolicyUpdated(
        uint256 perTxCap, uint256 dailyCap, uint256 approvalThreshold, uint8 minReputation, uint64 approvalTTL
    );

    /// @notice The owner changed the agent address.
    event AgentUpdated(address indexed previousAgent, address indexed newAgent);

    /// @notice The owner added or removed an allowlisted recipient.
    event AllowlistUpdated(address indexed account, bool allowed);

    /// @notice The owner changed the reputation oracle.
    event ReputationOracleUpdated(address indexed previousOracle, address indexed newOracle);

    /// @notice The owner pulled the kill switch.
    event Paused(address indexed by);

    /// @notice The owner released the kill switch.
    event Unpaused(address indexed by);

    /// @notice The owner withdrew funds from the vault.
    event Withdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    /// @notice `pay` was called by someone other than the agent.
    error NotAgent(address caller);

    /// @notice A required address argument was the zero address.
    error ZeroAddress();

    /// @notice The oracle address has no contract code.
    error InvalidOracle(address oracle);

    /// @notice The policy is malformed (`minReputation` > 100 or `approvalTTL` == 0).
    error InvalidPolicy();

    /// @notice No request exists with this ID.
    error RequestNotFound(uint256 requestId);

    /// @notice The request has already been approved, denied or expired.
    error RequestNotPending(uint256 requestId, RequestStatus status);

    /// @notice Approval refused because the vault is paused.
    error VaultIsPaused();

    /// @notice Approval refused because it would exceed today's daily cap.
    error ApprovalExceedsDailyCap(uint256 amount, uint256 remainingToday);

    /// @notice Approval or withdrawal refused because the vault does not hold enough tokens.
    error InsufficientVaultBalance(uint256 amount, uint256 balance);

    // ---------------------------------------------------------------------
    // Constructor & modifiers
    // ---------------------------------------------------------------------

    /// @param token_ The stablecoin the vault holds (e.g. USDC, 6 decimals).
    /// @param initialOwner The human who controls policy, approvals and withdrawals.
    /// @param agent_ The AI agent's address, the only one allowed to call `pay`.
    /// @param oracle_ The reputation oracle used for non-allowlisted recipients.
    /// @param policy_ The initial spending policy.
    constructor(IERC20 token_, address initialOwner, address agent_, IReputationOracle oracle_, Policy memory policy_)
        Ownable(initialOwner)
    {
        if (address(token_) == address(0) || agent_ == address(0)) revert ZeroAddress();
        token = token_;
        _setAgent(agent_);
        _setReputationOracle(oracle_);
        _setPolicy(policy_);
    }

    /// @dev Restricts a function to the configured agent.
    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent(msg.sender);
        _;
    }

    // ---------------------------------------------------------------------
    // Agent entry point
    // ---------------------------------------------------------------------

    /// @notice Asks the vault to pay `amount` to `to`. Called by the AI agent.
    /// @dev Never reverts because of the policy. A refusal emits `PaymentBlocked` and returns
    ///      normally, so the attempt stays recorded onchain.
    /// @param to Recipient.
    /// @param amount Amount in token units.
    /// @param memo The agent's reason for paying (shown on the dashboard).
    /// @return result `uint8(PayResult)`: 0 = Executed, 1 = Pending, 2 = Blocked.
    /// @return requestId The new request's ID if the result is Pending, otherwise 0.
    function pay(address to, uint256 amount, string calldata memo)
        external
        nonReentrant
        onlyAgent
        returns (uint8 result, uint256 requestId)
    {
        ReasonCode reason = _check(to, amount);

        if (reason != ReasonCode.NONE) {
            totalBlocked += 1;
            emit PaymentBlocked(to, amount, reason, reasonText(reason), memo);
            return (uint8(PayResult.Blocked), 0);
        }

        if (amount > _policy.approvalThreshold) {
            // Passed every check but is too large to send without a human. Park it.
            // Pending amounts do not count toward the daily cap until approved.
            requestId = ++requestCount;
            // Safe: uint64 seconds lasts ~585 billion years.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint64 nowTs = uint64(block.timestamp);
            _requests[requestId] = Request({
                to: to,
                amount: amount,
                memo: memo,
                createdAt: nowTs,
                expiresAt: nowTs + _policy.approvalTTL,
                status: RequestStatus.Pending
            });
            emit PaymentPending(requestId, to, amount, memo);
            return (uint8(PayResult.Pending), requestId);
        }

        // Effects before the external transfer (checks-effects-interactions).
        spentOnDay[_today()] += amount;
        totalPaid += amount;
        token.safeTransfer(to, amount);
        emit PaymentExecuted(to, amount, memo);
        return (uint8(PayResult.Executed), 0);
    }

    // ---------------------------------------------------------------------
    // Owner: approvals
    // ---------------------------------------------------------------------

    /// @notice Approves pending request `id` and sends the funds.
    /// @dev If the request is past its TTL, it is marked `Expired`, `PaymentExpired` is
    ///      emitted, and the function returns `false` without paying. It does not revert
    ///      in that case, because a revert would also roll back the `Expired` status.
    ///      Pause, daily cap and balance are re-checked at approval time. If any of them
    ///      fails, the call reverts and the request stays `Pending` so the owner can retry.
    /// @param id The request ID.
    /// @return approved True if the funds were sent, false if the request had expired.
    function approveRequest(uint256 id) external nonReentrant onlyOwner returns (bool approved) {
        Request storage req = _pendingRequest(id);

        // Minute-scale TTLs make the few seconds of validator timestamp drift irrelevant.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > req.expiresAt) {
            req.status = RequestStatus.Expired;
            emit PaymentExpired(id, req.to, req.amount);
            return false;
        }

        uint256 amount = req.amount;
        if (paused) revert VaultIsPaused();
        uint256 remaining = remainingToday();
        if (amount > remaining) revert ApprovalExceedsDailyCap(amount, remaining);
        uint256 bal = token.balanceOf(address(this));
        if (amount > bal) revert InsufficientVaultBalance(amount, bal);

        req.status = RequestStatus.Approved;
        spentOnDay[_today()] += amount;
        totalPaid += amount;
        token.safeTransfer(req.to, amount);
        emit PaymentApproved(id, req.to, amount);
        return true;
    }

    /// @notice Denies pending request `id`. No funds move.
    /// @param id The request ID.
    function denyRequest(uint256 id) external onlyOwner {
        Request storage req = _pendingRequest(id);
        req.status = RequestStatus.Denied;
        emit PaymentDenied(id, req.to, req.amount);
    }

    // ---------------------------------------------------------------------
    // Owner: configuration
    // ---------------------------------------------------------------------

    /// @notice Replaces the spending policy.
    /// @param perTxCap Largest single payment.
    /// @param dailyCap Largest total spend per day.
    /// @param approvalThreshold Payments above this need owner approval.
    /// @param minReputation Minimum score (0-100) for non-allowlisted recipients.
    /// @param approvalTTL Seconds a pending request stays approvable (must be > 0).
    function setPolicy(
        uint256 perTxCap,
        uint256 dailyCap,
        uint256 approvalThreshold,
        uint8 minReputation,
        uint64 approvalTTL
    ) external onlyOwner {
        _setPolicy(Policy(perTxCap, dailyCap, approvalThreshold, minReputation, approvalTTL));
    }

    /// @notice Changes which address acts as the agent. Use it to rotate a leaked agent key.
    /// @param newAgent The new agent address (must be non-zero).
    function setAgent(address newAgent) external onlyOwner {
        _setAgent(newAgent);
    }

    /// @notice Adds `account` to, or removes it from, the recipient allowlist.
    /// @param account The recipient.
    /// @param allowed True to trust it outright (skip the reputation check).
    function setAllowlist(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        allowlist[account] = allowed;
        emit AllowlistUpdated(account, allowed);
    }

    /// @notice Changes the reputation oracle.
    /// @param newOracle The new oracle (must be a deployed contract).
    function setReputationOracle(IReputationOracle newOracle) external onlyOwner {
        _setReputationOracle(newOracle);
    }

    /// @notice Kill switch: blocks every payment and approval until `unpause`.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Releases the kill switch.
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Sends vault funds back to the owner, or anywhere else. Works while paused.
    /// @param to Recipient of the withdrawal.
    /// @param amount Amount in token units.
    function withdraw(address to, uint256 amount) external nonReentrant onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = token.balanceOf(address(this));
        if (amount > bal) revert InsufficientVaultBalance(amount, bal);
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    // ---------------------------------------------------------------------
    // Views (for the agent and the dashboard)
    // ---------------------------------------------------------------------

    /// @notice Returns the current spending policy.
    function getPolicy() external view returns (Policy memory) {
        return _policy;
    }

    /// @notice Amount spent so far in the current day.
    function spentToday() public view returns (uint256) {
        return spentOnDay[_today()];
    }

    /// @notice Amount the agent can still spend today before hitting `dailyCap`.
    /// @dev Returns 0 (not an underflow) if the owner lowered the cap below today's spend.
    function remainingToday() public view returns (uint256) {
        uint256 cap = _policy.dailyCap;
        uint256 spent = spentToday();
        return spent >= cap ? 0 : cap - spent;
    }

    /// @notice Returns approval request `id`.
    /// @param id The request ID (1-based).
    function getRequest(uint256 id) external view returns (Request memory) {
        if (id == 0 || id > requestCount) revert RequestNotFound(id);
        return _requests[id];
    }

    /// @notice The vault's current token balance.
    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice The reputation score the vault would use for `account`.
    /// @dev Returns 0 if the oracle call reverts, so a broken oracle fails closed.
    function reputationOf(address account) public view returns (uint8) {
        try reputationOracle.getScore(account) returns (uint8 score) {
            return score;
        } catch {
            return 0;
        }
    }

    /// @notice Dry run of `pay`: what would happen if the agent paid `amount` to `to` right now.
    /// @dev Lets the agent (or UI) explain a refusal before sending a transaction.
    /// @return reason `NONE` if the payment would pass every check, otherwise the first failure.
    /// @return needsApproval True if it would pass but become a pending request.
    function previewPayment(address to, uint256 amount) external view returns (ReasonCode reason, bool needsApproval) {
        reason = _check(to, amount);
        needsApproval = reason == ReasonCode.NONE && amount > _policy.approvalThreshold;
    }

    /// @notice Human-readable text for a reason code, as emitted in `PaymentBlocked`.
    function reasonText(ReasonCode reason) public pure returns (string memory) {
        if (reason == ReasonCode.VAULT_PAUSED) return "VAULT_PAUSED";
        if (reason == ReasonCode.INVALID_PAYMENT) return "INVALID_PAYMENT";
        if (reason == ReasonCode.EXCEEDS_PER_TX_CAP) return "EXCEEDS_PER_TX_CAP";
        if (reason == ReasonCode.EXCEEDS_DAILY_CAP) return "EXCEEDS_DAILY_CAP";
        if (reason == ReasonCode.LOW_REPUTATION) return "LOW_REPUTATION";
        if (reason == ReasonCode.INSUFFICIENT_BALANCE) return "INSUFFICIENT_BALANCE";
        return "NONE";
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Runs the policy checks in order and returns the first failure, or `NONE`.
    function _check(address to, uint256 amount) internal view returns (ReasonCode) {
        if (paused) return ReasonCode.VAULT_PAUSED;
        if (amount == 0 || to == address(0) || to == address(this)) return ReasonCode.INVALID_PAYMENT;
        if (amount > _policy.perTxCap) return ReasonCode.EXCEEDS_PER_TX_CAP;
        // Written as `amount > remaining` rather than `spent + amount > cap` so a huge
        // `amount` can never overflow and make `pay` revert.
        if (amount > remainingToday()) return ReasonCode.EXCEEDS_DAILY_CAP;
        if (!allowlist[to] && reputationOf(to) < _policy.minReputation) return ReasonCode.LOW_REPUTATION;
        if (token.balanceOf(address(this)) < amount) return ReasonCode.INSUFFICIENT_BALANCE;
        return ReasonCode.NONE;
    }

    /// @dev Loads request `id` and requires it to exist and be `Pending`.
    function _pendingRequest(uint256 id) internal view returns (Request storage req) {
        if (id == 0 || id > requestCount) revert RequestNotFound(id);
        req = _requests[id];
        if (req.status != RequestStatus.Pending) revert RequestNotPending(id, req.status);
    }

    /// @dev Current day index used for daily spend tracking (UTC days since epoch).
    function _today() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /// @dev Validates and stores a new policy.
    function _setPolicy(Policy memory p) internal {
        if (p.minReputation > 100 || p.approvalTTL == 0) revert InvalidPolicy();
        _policy = p;
        emit PolicyUpdated(p.perTxCap, p.dailyCap, p.approvalThreshold, p.minReputation, p.approvalTTL);
    }

    /// @dev Validates and stores a new agent.
    function _setAgent(address newAgent) internal {
        if (newAgent == address(0)) revert ZeroAddress();
        address previous = agent;
        agent = newAgent;
        emit AgentUpdated(previous, newAgent);
    }

    /// @dev Validates and stores a new oracle. It must have code, otherwise a call to it
    ///      would revert while decoding the empty return data, which `try/catch` cannot catch.
    function _setReputationOracle(IReputationOracle newOracle) internal {
        if (address(newOracle).code.length == 0) revert InvalidOracle(address(newOracle));
        address previous = address(reputationOracle);
        reputationOracle = newOracle;
        emit ReputationOracleUpdated(previous, address(newOracle));
    }
}

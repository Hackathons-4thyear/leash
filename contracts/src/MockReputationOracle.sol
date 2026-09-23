// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReputationOracle} from "./interfaces/IReputationOracle.sol";

/// @title MockReputationOracle
/// @notice Owner-curated reputation scores for the demo. Unknown addresses score 0.
/// @dev Placeholder: this will be replaced by an adapter that reads the ERC-8004
///      Reputation Registry and exposes the same `IReputationOracle` interface, so
///      the LeashVault does not need to change.
contract MockReputationOracle is IReputationOracle, Ownable {
    /// @notice Highest valid score.
    uint8 public constant MAX_SCORE = 100;

    /// @dev Scores by address. Addresses never set read as 0.
    mapping(address account => uint8 score) private _scores;

    /// @notice Emitted when the owner sets a score.
    /// @param account The scored address.
    /// @param score The new score (0-100).
    event ScoreUpdated(address indexed account, uint8 score);

    /// @notice Thrown when a score above `MAX_SCORE` is submitted.
    /// @param score The rejected score.
    error ScoreOutOfRange(uint8 score);

    /// @param initialOwner Address allowed to set scores.
    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Sets the reputation score of `account`.
    /// @param account The address to score.
    /// @param score The score, from 0 to 100.
    function setScore(address account, uint8 score) external onlyOwner {
        if (score > MAX_SCORE) revert ScoreOutOfRange(score);
        _scores[account] = score;
        emit ScoreUpdated(account, score);
    }

    /// @inheritdoc IReputationOracle
    function getScore(address account) external view returns (uint8) {
        return _scores[account];
    }
}

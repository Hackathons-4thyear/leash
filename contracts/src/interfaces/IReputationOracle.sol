// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IReputationOracle
/// @notice Minimal interface the LeashVault uses to look up how trustworthy a payee is.
/// @dev The demo uses `MockReputationOracle`. It will later be replaced by an adapter that
///      reads the ERC-8004 Reputation Registry and maps its feedback to a 0-100 score.
interface IReputationOracle {
    /// @notice Returns the reputation score of `account`.
    /// @param account The address being scored (e.g. a paid API's payment address).
    /// @return score A score from 0 (unknown / untrusted) to 100 (fully trusted).
    function getScore(address account) external view returns (uint8 score);
}

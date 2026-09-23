// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice A 6-decimal stand-in for USDC, used on testnets and in tests.
/// @dev TESTNET ONLY. `mint` has NO access control: anyone can mint any amount.
///      Never deploy this contract to a production network.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    /// @notice Returns 6, matching real USDC.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints `amount` (6-decimal units) to `to`.
    /// @dev TESTNET ONLY: intentionally permissionless so demos and faucets are trivial.
    /// @param to Recipient of the newly minted tokens.
    /// @param amount Amount to mint, in 6-decimal units (1 mUSDC = 1_000_000).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

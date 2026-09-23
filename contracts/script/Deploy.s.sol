// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {LeashVault} from "../src/LeashVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockReputationOracle} from "../src/MockReputationOracle.sol";

/// @title Deploy
/// @notice Deploys the Leash demo stack: MockUSDC, MockReputationOracle and a funded LeashVault.
/// @dev Env vars: DEPLOYER_PRIVATE_KEY, AGENT_ADDRESS, LEGIT_API_ADDRESS, ATTACKER_ADDRESS.
///      The deployer becomes the vault owner and the oracle owner.
contract Deploy is Script {
    uint256 internal constant USDC = 1e6;

    // Demo policy (6-decimal units).
    uint256 internal constant PER_TX_CAP = 10 * USDC;
    uint256 internal constant DAILY_CAP = 25 * USDC;
    uint256 internal constant APPROVAL_THRESHOLD = 5 * USDC;
    uint8 internal constant MIN_REPUTATION = 60;
    uint64 internal constant APPROVAL_TTL = 1 hours;

    uint256 internal constant VAULT_FUNDING = 100 * USDC;
    uint8 internal constant LEGIT_API_SCORE = 85;
    uint8 internal constant ATTACKER_SCORE = 12;

    /// @notice Runs the deployment.
    /// @return usdc The mock stablecoin.
    /// @return oracle The mock reputation oracle.
    /// @return vault The funded LeashVault.
    function run() external returns (MockUSDC usdc, MockReputationOracle oracle, LeashVault vault) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address agent = vm.envAddress("AGENT_ADDRESS");
        address legitApi = vm.envAddress("LEGIT_API_ADDRESS");
        address attacker = vm.envAddress("ATTACKER_ADDRESS");

        LeashVault.Policy memory policy = LeashVault.Policy({
            perTxCap: PER_TX_CAP,
            dailyCap: DAILY_CAP,
            approvalThreshold: APPROVAL_THRESHOLD,
            minReputation: MIN_REPUTATION,
            approvalTTL: APPROVAL_TTL
        });

        vm.startBroadcast(deployerKey);

        usdc = new MockUSDC();
        oracle = new MockReputationOracle(deployer);
        vault = new LeashVault(usdc, deployer, agent, oracle, policy);

        usdc.mint(address(vault), VAULT_FUNDING);
        oracle.setScore(legitApi, LEGIT_API_SCORE);
        oracle.setScore(attacker, ATTACKER_SCORE);

        vm.stopBroadcast();

        console2.log("=== Leash deployment (chain id %s) ===", block.chainid);
        console2.log("Owner / deployer:     ", deployer);
        console2.log("Agent:                ", agent);
        console2.log("MockUSDC:             ", address(usdc));
        console2.log("MockReputationOracle: ", address(oracle));
        console2.log("LeashVault:           ", address(vault));
        console2.log("Legit API (score 85): ", legitApi);
        console2.log("Attacker (score 12):  ", attacker);
        console2.log("Vault funded with 100 mUSDC");
    }
}

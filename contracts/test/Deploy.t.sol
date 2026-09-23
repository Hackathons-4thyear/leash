// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {LeashVault} from "../src/LeashVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockReputationOracle} from "../src/MockReputationOracle.sol";

/// @notice Dry-runs the deploy script locally so a broken script is caught before testnet.
contract DeployTest is Test {
    // Anvil's well-known first dev key. Never use it on a real network.
    uint256 internal constant DEV_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function test_DeployScript() public {
        address agent = makeAddr("agent");
        address legitApi = makeAddr("legitApi");
        address attacker = makeAddr("attacker");

        vm.setEnv("DEPLOYER_PRIVATE_KEY", vm.toString(bytes32(DEV_KEY)));
        vm.setEnv("AGENT_ADDRESS", vm.toString(agent));
        vm.setEnv("LEGIT_API_ADDRESS", vm.toString(legitApi));
        vm.setEnv("ATTACKER_ADDRESS", vm.toString(attacker));

        (MockUSDC usdc, MockReputationOracle oracle, LeashVault vault) = new Deploy().run();

        address deployer = vm.addr(DEV_KEY);
        assertEq(usdc.decimals(), 6);
        assertEq(vault.owner(), deployer);
        assertEq(oracle.owner(), deployer);
        assertEq(vault.agent(), agent);
        assertEq(vault.balance(), 100e6);
        assertEq(oracle.getScore(legitApi), 85);
        assertEq(oracle.getScore(attacker), 12);

        LeashVault.Policy memory p = vault.getPolicy();
        assertEq(p.perTxCap, 10e6);
        assertEq(p.dailyCap, 25e6);
        assertEq(p.approvalThreshold, 5e6);
        assertEq(p.minReputation, 60);
        assertEq(p.approvalTTL, 1 hours);
    }
}

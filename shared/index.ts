import baseSepoliaJson from "./deployments/base-sepolia.json" with { type: "json" };

export { leashVaultAbi } from "./abi/LeashVault";
export { mockUsdcAbi } from "./abi/MockUSDC";
export { mockReputationOracleAbi } from "./abi/MockReputationOracle";

type Address = `0x${string}`;

export type Deployment = {
  network: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  deployBlock: number;
  usdcDecimals: number;
  addresses: {
    vault: Address;
    usdc: Address;
    oracle: Address;
    agent: Address;
    legitApi: Address;
    attacker: Address;
  };
};

export const baseSepolia = baseSepoliaJson as Deployment;

/** Mirrors LeashVault.ReasonCode. */
export const REASON_CODES = [
  "NONE",
  "VAULT_PAUSED",
  "INVALID_PAYMENT",
  "EXCEEDS_PER_TX_CAP",
  "EXCEEDS_DAILY_CAP",
  "LOW_REPUTATION",
  "INSUFFICIENT_BALANCE",
] as const;

export const txUrl = (hash: string, d: Deployment = baseSepolia) => `${d.explorerUrl}/tx/${hash}`;
export const addressUrl = (address: string, d: Deployment = baseSepolia) => `${d.explorerUrl}/address/${address}`;
export { parseVaultVerdict, encodePaymentHeader, decodePaymentResponse, type VaultVerdict } from "./x402";

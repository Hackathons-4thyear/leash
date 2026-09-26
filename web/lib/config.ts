import { baseSepolia as deployment } from "@leash/shared";
import { getAddress, type Address } from "viem";
import { baseSepolia as chain } from "viem/chains";

export { deployment, chain };

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || deployment.rpcUrl;
export const AGENT_URL = (process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:4022").replace(/\/$/, "");

export const VAULT = deployment.addresses.vault;
export const ORACLE = deployment.addresses.oracle;
export const USDC = deployment.addresses.usdc;
export const DEPLOY_BLOCK = BigInt(deployment.deployBlock);
export const DECIMALS = deployment.usdcDecimals;

/** Base produces a block every 2 seconds, so block timestamps can be derived from one anchor. */
export const BLOCK_TIME_SECONDS = 2;
export const POLL_MS = 4_000;

export type Known = { label: string; tone: "safe" | "danger" | "neutral" | "accent" };

const known = new Map<string, Known>([
  [deployment.addresses.legitApi.toLowerCase(), { label: "Legit Data API", tone: "safe" }],
  [deployment.addresses.attacker.toLowerCase(), { label: "Attacker", tone: "danger" }],
  [deployment.addresses.agent.toLowerCase(), { label: "Agent", tone: "accent" }],
  [VAULT.toLowerCase(), { label: "Leash Vault", tone: "neutral" }],
  [ORACLE.toLowerCase(), { label: "Reputation Oracle", tone: "neutral" }],
  [USDC.toLowerCase(), { label: "mUSDC", tone: "neutral" }],
]);

/** Adds the owner label once it has been read from the vault. */
export function registerOwner(owner: Address) {
  const key = owner.toLowerCase();
  if (!known.has(key)) known.set(key, { label: "Owner", tone: "accent" });
}

export const labelOf = (address?: string): Known | undefined => (address ? known.get(address.toLowerCase()) : undefined);

/** Addresses whose reputation the policy panel shows. */
export const WATCHED: { address: Address; label: string }[] = [
  { address: getAddress(deployment.addresses.legitApi), label: "Legit Data API" },
  { address: getAddress(deployment.addresses.attacker), label: "Attacker" },
];

export const txUrl = (hash: string) => `${deployment.explorerUrl}/tx/${hash}`;
export const addressUrl = (address: string) => `${deployment.explorerUrl}/address/${address}`;

import { createPublicClient, http } from "viem";
import { createConfig, injected } from "wagmi";
import { chain, RPC_URL } from "./config";

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [chain.id]: http(RPC_URL, { batch: true }) },
  ssr: true,
});

/** Read-only client on the public RPC: works with no wallet connected. */
export const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL, { batch: { wait: 16 }, retryCount: 3 }),
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

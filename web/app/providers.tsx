"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { AgentProvider } from "@/lib/agent";
import { VaultProvider } from "@/lib/vault";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 2 } } }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <VaultProvider>
          <AgentProvider>{children}</AgentProvider>
        </VaultProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

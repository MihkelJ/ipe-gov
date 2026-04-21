import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import type { ReactNode } from "react";
import { wagmiConfig } from "../../lib/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

export function getContext() {
  const queryClient = new QueryClient();
  return { queryClient };
}

export default function TanstackQueryProvider({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

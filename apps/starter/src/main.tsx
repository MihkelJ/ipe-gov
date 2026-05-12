import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { base, mainnet, sepolia } from "viem/chains";
import { getRouter } from "./router";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { wagmiConfig } from "./lib/wagmi";
import "./styles.css";

// JSON.stringify can't serialize BigInt — react-query devtools and any
// incidental console.log of wagmi args (block numbers, vote counts) would
// throw `TypeError: Do not know how to serialize a BigInt` and crash the
// render. Coerce to a decimal string so anything passing through JSON sees
// a serializable value.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const { queryClient } = getContext();
const router = getRouter(queryClient);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
if (!PRIVY_APP_ID) throw new Error("VITE_PRIVY_APP_ID is not set — copy .env.example to .env.local and fill it in.");

createRoot(rootEl).render(
  <StrictMode>
    {/*
      Provider order per Privy docs:
      PrivyProvider > QueryClientProvider > WagmiProvider
      https://docs.privy.io/guide/react/wallets/usage/wagmi
    */}
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "wallet"],
        // Sepolia is the membership / governance chain. Base and Mainnet are
        // present so reads (token balances, ENS records) work without the
        // user switching networks.
        defaultChain: sepolia,
        supportedChains: [sepolia, base, mainnet],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <RouterProvider router={router} />
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  </StrictMode>,
);

import { createConfig } from "@privy-io/wagmi";
import { base, mainnet, sepolia } from "viem/chains";
import { http } from "wagmi";

// All RPC traffic routes through the paymaster-proxy worker, which routes by
// chainId in the path. Sepolia is the governance chain (sponsored writes +
// reads). Base and Mainnet are read-only forwards (token balances, ENS).
const proxyBase = import.meta.env.VITE_PAYMASTER_PROXY_URL;
const rpcUrl = (chainId: number) => `${proxyBase}/${chainId}`;

export const wagmiConfig = createConfig({
  chains: [sepolia, base, mainnet],
  transports: {
    [sepolia.id]: http(rpcUrl(sepolia.id)),
    [base.id]: http(rpcUrl(base.id), { batch: true }),
    [mainnet.id]: http(rpcUrl(mainnet.id), { batch: true }),
  },
});

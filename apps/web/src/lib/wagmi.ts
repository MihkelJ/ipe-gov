import { createConfig } from "@privy-io/wagmi";
import { base, mainnet, sepolia } from "viem/chains";
import { http } from "wagmi";

// Privy owns wallet connection; wagmi provides the chain/transport layer
// that existing hooks (useAccount, useReadContract, useSponsoredWrite) read
// from. Sepolia is the governance chain. The paymaster-proxy worker routes
// by chainId in the path (/rpc/:chainId, Pimlico-style) so a single base
// URL serves all chains: sponsored writes on Sepolia, read-only forwards on
// Base (IPE balances) and Mainnet (ENS records).
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

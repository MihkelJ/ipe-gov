import { useMutation } from "@tanstack/react-query";
import { encodeFunctionData, http, type Abi, type Hex } from "viem";
import { sendCalls, waitForCallsStatus } from "viem/actions";
import { entryPoint08Address } from "viem/account-abstraction";
import { sepolia } from "viem/chains";
import { useSign7702Authorization } from "@privy-io/react-auth";
import {
  useCapabilities,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";

export type WriteParams = {
  address: Hex;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

const PAYMASTER_BASE = import.meta.env.VITE_PAYMASTER_PROXY_URL as
  | string
  | undefined;
// The proxy routes by chainId in the path. Sponsored writes target the
// governance chain (Sepolia); Base/Mainnet writes are not gas-sponsored.
const PAYMASTER_URL = PAYMASTER_BASE
  ? `${PAYMASTER_BASE}/${sepolia.id}`
  : undefined;

/**
 * Submit a contract write, sponsored by Pimlico.
 *
 *   - If the wallet advertises EIP-5792 `paymasterService` support
 *     (Coinbase Smart Wallet, Safe, Privy embedded, etc.) we hand the bundle
 *     straight to the wallet via `wallet_sendCalls` — the wallet coordinates
 *     sponsorship with the paymaster itself.
 *   - Everyone else (plain EOAs like MetaMask) gets upgraded to a SimpleAccount
 *     via EIP-7702 once, then every subsequent write is batched + sponsored
 *     as a 4337 user operation through the Pimlico bundler.
 *
 * The worker still gates sponsorship on Unlock-key membership, so non-members
 * won't get sponsored down either path.
 */
export function useSponsoredWrite() {
  const { data: walletClient, refetch: refetchWalletClient } = useWalletClient();
  // Pin to Sepolia so waitForTransactionReceipt polls the governance chain
  // regardless of which chain the wallet happens to be on at render time.
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { mutateAsync: switchChainAsync } = useSwitchChain();
  const { signAuthorization } = useSign7702Authorization();
  const { data: capabilities } = useCapabilities({
    account: walletClient?.account?.address,
    query: { enabled: Boolean(walletClient?.account?.address) },
  });

  return useMutation({
    mutationKey: ["sponsoredWrite"],
    mutationFn: async (params: WriteParams | WriteParams[]): Promise<Hex> => {
      if (!walletClient?.account) throw new Error("wallet not connected");
      if (!PAYMASTER_URL) throw new Error("VITE_PAYMASTER_PROXY_URL not set");
      if (!publicClient) throw new Error("public client unavailable");

      // External wallets may be on any chain when the user triggers a write.
      // Force Sepolia before signing — otherwise the wallet will sign on the
      // wrong chain and the subsequent wait hangs until timeout.
      let client = walletClient;
      if (client.chain.id !== sepolia.id) {
        await switchChainAsync({ chainId: sepolia.id });
        const { data: fresh } = await refetchWalletClient();
        if (!fresh?.account) throw new Error("wallet not connected");
        client = fresh;
      }

      const paramsArray = Array.isArray(params) ? params : [params];
      if (paramsArray.length === 0) throw new Error("no calls to send");
      const calls = paramsArray.map((p) => ({
        to: p.address,
        value: 0n,
        data: encodeFunctionData({
          abi: p.abi,
          functionName: p.functionName,
          args: p.args,
        }),
      }));

      const chainCaps = capabilities?.[sepolia.id];
      const paymasterSupported = chainCaps?.paymasterService?.supported === true;

      // Path A: EIP-5792 wallet_sendCalls + paymasterService capability.
      if (paymasterSupported) {
        const { id } = await sendCalls(client, {
          chain: sepolia,
          calls,
          capabilities: {
            paymasterService: { url: PAYMASTER_URL, optional: true },
          },
        });

        const result = await waitForCallsStatus(client, {
          id,
          throwOnFailure: true,
          // viem's default (~60s) trips on ordinary Sepolia+Pimlico inclusion
          // jitter even when the UserOp does land. Three minutes swallows
          // that jitter without hiding a genuinely stuck bundle.
          timeout: 180_000,
        });

        const txHash = result.receipts?.[0]?.transactionHash;
        if (!txHash) throw new Error("call bundle finished without a tx hash");
        return txHash;
      }

      // Path B: EIP-7702 upgrade via Pimlico. Works for any EOA whose signer
      // implements authorization signxing (which Privy's hook routes to either
      // the embedded wallet directly or the connected external wallet's
      // `wallet_signAuthorization` RPC).
      const smartAccount = await to7702SimpleSmartAccount({
        client: publicClient,
        owner: client,
        entryPoint: { address: entryPoint08Address, version: "0.8" },
      });

      const pimlicoClient = createPimlicoClient({
        chain: sepolia,
        transport: http(PAYMASTER_URL),
      });

      const smartAccountClient = createSmartAccountClient({
        account: smartAccount,
        chain: sepolia,
        bundlerTransport: http(PAYMASTER_URL),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () =>
            (await pimlicoClient.getUserOperationGasPrice()).fast,
        },
      });

      // If the EOA already has delegated code (from a prior run or another
      // app), skip the authorization signature — saves the user a prompt.
      const code = await publicClient.getCode({
        address: client.account.address,
      });
      const alreadyDelegated = code !== undefined && code !== "0x";

      const authorization = alreadyDelegated
        ? undefined
        : await signAuthorization(
            {
              contractAddress: smartAccount.authorization.address,
              chainId: sepolia.id,
            },
            { address: client.account.address },
          );

      return await smartAccountClient.sendTransaction({
        calls,
        ...(authorization ? { authorization } : {}),
      });
    },
  });
}

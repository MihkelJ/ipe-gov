import { useMutation } from "@tanstack/react-query";
import { encodeFunctionData, type Abi, type Hex } from "viem";
import {
  sendCalls,
  sendTransaction,
  waitForCallsStatus,
  waitForTransactionReceipt,
} from "viem/actions";
import { useCapabilities, usePublicClient, useWalletClient } from "wagmi";

export type WriteParams = {
  address: Hex;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

const PAYMASTER_URL = import.meta.env.VITE_PAYMASTER_PROXY_URL as
  | string
  | undefined;

/**
 * Submit a contract write, optionally sponsored via EIP-5792
 * `wallet_sendCalls` + `paymasterService`.
 *
 *   - Wallets that advertise `paymasterService: { supported: true }` in
 *     `wallet_getCapabilities` (Coinbase Smart Wallet, Ambire, Safe, Rabby,
 *     MetaMask with 7702 enabled) take the 5792 path and get sponsored.
 *   - Everyone else (plain EOA MetaMask, WalletConnect EOAs) falls through
 *     to sequential `eth_sendTransaction` calls — the user pays gas.
 *
 * The worker keeps gating sponsorship on Unlock-key membership of the sender,
 * so non-members on capable wallets simply won't get sponsored either.
 */
export function useSponsoredWrite() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { data: capabilities } = useCapabilities({
    account: walletClient?.account?.address,
    query: { enabled: Boolean(walletClient?.account?.address) },
  });

  return useMutation({
    mutationKey: ["sponsoredWrite"],
    mutationFn: async (params: WriteParams | WriteParams[]): Promise<Hex> => {
      if (!walletClient?.account) throw new Error("wallet not connected");
      if (!PAYMASTER_URL) throw new Error("VITE_PAYMASTER_PROXY_URL not set");

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

      // `useCapabilities` returns a per-chain map (keyed by chainId, as a
      // number in wagmi's typed version). If the current chain reports
      // `paymasterService.supported`, bundle + sponsor via 5792.
      const chainId = walletClient.chain.id;
      const chainCaps = capabilities?.[chainId];
      const paymasterSupported = chainCaps?.paymasterService?.supported === true;

      if (paymasterSupported) {
        const { id } = await sendCalls(walletClient, {
          calls,
          capabilities: {
            paymasterService: { url: PAYMASTER_URL, optional: true },
          },
        });

        const result = await waitForCallsStatus(walletClient, {
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

      // Plain EOA: send each call one-by-one via eth_sendTransaction.
      let lastHash: Hex | undefined;
      for (const call of calls) {
        lastHash = await sendTransaction(walletClient, {
          account: walletClient.account,
          chain: walletClient.chain,
          to: call.to,
          data: call.data,
          value: call.value,
        });
        if (publicClient)
          await waitForTransactionReceipt(publicClient, { hash: lastHash });
      }
      if (!lastHash) throw new Error("no transaction was sent");
      return lastHash;
    },
  });
}

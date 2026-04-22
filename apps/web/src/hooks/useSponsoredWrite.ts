import { useMutation } from "@tanstack/react-query";
import { encodeFunctionData, type Abi, type Hex } from "viem";
import { sendCalls, waitForCallsStatus } from "viem/actions";
import { useWalletClient } from "wagmi";

type WriteParams = {
  address: Hex;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

const PAYMASTER_URL = import.meta.env.VITE_PAYMASTER_PROXY_URL as
  | string
  | undefined;

/**
 * Submit a contract write through EIP-5792 `wallet_sendCalls`, advertising
 * our paymaster-proxy as the `paymasterService` capability. This single path
 * supports:
 *   - Smart wallets (Ambire, Coinbase Smart Wallet, Safe) — the wallet uses
 *     its own bundler and pulls sponsorship from our worker.
 *   - 7702-capable EOAs (MetaMask with the flag, Rabby) — the wallet does the
 *     7702 delegation itself and uses our worker for paymaster data.
 *   - Plain EOAs without 5792 / paymaster support — viem's experimental
 *     fallback degrades to a normal eth_sendTransaction; user pays gas.
 *
 * The worker keeps gating sponsorship on Unlock-key membership of the sender,
 * so non-members on capable wallets simply won't get sponsored either.
 */
export function useSponsoredWrite() {
  const { data: walletClient } = useWalletClient();

  return useMutation({
    mutationKey: ["sponsoredWrite"],
    mutationFn: async (params: WriteParams): Promise<Hex> => {
      if (!walletClient?.account) throw new Error("wallet not connected");
      if (!PAYMASTER_URL) throw new Error("VITE_PAYMASTER_PROXY_URL not set");

      const data = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
      });

      const { id } = await sendCalls(walletClient, {
        calls: [{ to: params.address, value: 0n, data }],
        capabilities: {
          paymasterService: { url: PAYMASTER_URL },
        },
        experimental_fallback: true,
      });

      const result = await waitForCallsStatus(walletClient, {
        id,
        throwOnFailure: true,
      });

      const txHash = result.receipts?.[0]?.transactionHash;
      if (!txHash) throw new Error("call bundle finished without a tx hash");
      return txHash;
    },
  });
}

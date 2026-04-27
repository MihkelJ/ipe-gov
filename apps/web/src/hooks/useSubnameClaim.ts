import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { buildClaimMessage, postClaim, type ClaimResponse } from "#/lib/ensApi";

/** Sign one membership message and POST it to ens-api. The worker re-checks
 *  Unlock on Sepolia and then mints the subname onchain on mainnet from its
 *  operator wallet — member doesn't pay gas, doesn't switch chains. */
export function useSubnameClaim() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["subname-claim"],
    mutationFn: async (input: { label: string }): Promise<ClaimResponse> => {
      if (!address) throw new Error("wallet not connected");

      const timestampMs = Date.now();
      const message = buildClaimMessage({
        intent: "claim subname",
        recipient: address,
        label: input.label,
        timestampMs,
      });
      const signature = await signMessageAsync({ message });
      const result = await postClaim({
        label: input.label,
        recipient: address,
        signature,
        message,
      });

      // Bust caches so AddressIdentity / Header / members page pick up the
      // new name on the next render without a manual reload.
      const lower = address.toLowerCase();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["identity", lower] }),
        queryClient.invalidateQueries({ queryKey: ["l2-subname-identities"] }),
        queryClient.invalidateQueries({ queryKey: ["subname-identity", lower] }),
      ]);
      return result;
    },
  });
}

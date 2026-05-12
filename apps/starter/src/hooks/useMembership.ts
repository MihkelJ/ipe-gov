import type { Address } from "viem";
import { sepolia } from "viem/chains";
import { useReadContract } from "wagmi";
import { PublicLockABI, addresses } from "@ipe-gov/sdk";

// Sepolia Lock address + Unlock checkout URL exported so the gated routes
// can link there directly when the connected wallet has no key.
export const UNLOCK_LOCK_ADDRESS = addresses.sepolia.lock as Address;
export const UNLOCK_CHAIN_ID = sepolia.id;
export const UNLOCK_CHECKOUT_URL = `https://app.unlock-protocol.com/checkout?paywallConfig=${encodeURIComponent(
  JSON.stringify({
    locks: { [UNLOCK_LOCK_ADDRESS]: { network: UNLOCK_CHAIN_ID } },
    pessimistic: true,
  }),
)}`;

/** Reads `PublicLock.getHasValidKey(address)` on Sepolia — the L4 membership
 *  predicate that gates every privileged action across the stack. Workers
 *  re-check this server-side via `assertSepoliaUnlockMember`, so client-side
 *  state is a UX hint, not a trust boundary. */
export function useMembership(address: Address | undefined) {
  const query = useReadContract({
    abi: PublicLockABI,
    address: UNLOCK_LOCK_ADDRESS,
    chainId: UNLOCK_CHAIN_ID,
    functionName: "getHasValidKey",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      staleTime: 60_000,
    },
  });

  return {
    isMember: query.data === true,
    isLoading: query.isLoading,
    error: query.error,
    address,
  };
}

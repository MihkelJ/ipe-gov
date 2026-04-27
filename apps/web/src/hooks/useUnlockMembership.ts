import type { Address } from "viem";
import { sepolia } from "viem/chains";
import { useReadContract } from "wagmi";
import { PublicLockABI, addresses } from "@ipe-gov/sdk";

export const UNLOCK_LOCK_ADDRESS = addresses.sepolia.lock as Address;
export const UNLOCK_CHAIN_ID = sepolia.id;
export const UNLOCK_CHECKOUT_URL = `https://app.unlock-protocol.com/checkout?paywallConfig=${encodeURIComponent(
  JSON.stringify({
    locks: { [UNLOCK_LOCK_ADDRESS]: { network: UNLOCK_CHAIN_ID } },
    pessimistic: true,
  }),
)}`;

export function useUnlockMembership(address: Address | undefined) {
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
  };
}

import { useMemo } from "react";
import { isAddress, type Hex } from "viem";
import { useQuery } from "@tanstack/react-query";
import { addresses } from "@ipe-gov/sdk";

const SUBGRAPH_URL = "https://subgraph.unlock-protocol.com/11155111";

/** Unlock's subgraph stores `expiration` as a decimal BigInt string. "Never"
 *  expirations use `type(uint256).max`, which comparison-wise is still just a
 *  larger number — so `expiration_gt: <now>` catches them naturally. */
const MEMBER_QUERY = /* GraphQL */ `
  query LockKeys($lock: String!, $now: BigInt!) {
    keys(where: { lock: $lock, expiration_gt: $now }, first: 1000) {
      owner
      expiration
    }
  }
`;

type KeysResponse = {
  data?: { keys: { owner: string; expiration: string }[] };
  errors?: { message: string }[];
};

/** Current key holders of the configured Unlock lock.
 *
 *  Uses Unlock's public Sepolia subgraph at `subgraph.unlock-protocol.com/11155111`.
 *  We switched off on-chain enumeration (`totalSupply` + `tokenByIndex`) because
 *  Unlock counts every key ever minted, leaving holes from burns/cancels that
 *  made the picker show zero-addresses and miss later members. Full-range
 *  `eth_getLogs` on public Sepolia RPCs is rate-limited / refused, so the
 *  subgraph is the portable path. */
export function useAllMembers() {
  const query = useQuery({
    queryKey: ["unlock-members", addresses.sepolia.lock.toLowerCase()],
    staleTime: 60_000,
    queryFn: async (): Promise<Hex[]> => {
      const now = Math.floor(Date.now() / 1000).toString();
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: MEMBER_QUERY,
          variables: { lock: addresses.sepolia.lock.toLowerCase(), now },
        }),
      });
      if (!res.ok) {
        throw new Error(`subgraph ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as KeysResponse;
      if (json.errors?.length) {
        throw new Error(json.errors.map((e) => e.message).join("; "));
      }
      const keys = json.data?.keys ?? [];
      const unique = new Set<string>();
      for (const k of keys) {
        if (isAddress(k.owner)) unique.add(k.owner.toLowerCase());
      }
      return Array.from(unique) as Hex[];
    },
  });

  const owners = useMemo(() => query.data ?? ([] as readonly Hex[]), [query.data]);

  return {
    owners,
    total: owners.length,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

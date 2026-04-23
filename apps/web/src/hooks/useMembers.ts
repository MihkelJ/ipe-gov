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
    keys(
      where: { lock: $lock, expiration_gt: $now }
      first: 1000
      orderBy: createdAtBlock
      orderDirection: desc
    ) {
      owner
      tokenId
      expiration
      createdAtBlock
    }
  }
`;

type RawKey = {
  owner: string;
  tokenId: string;
  expiration: string;
  createdAtBlock: string;
};

type KeysResponse = {
  data?: { keys: RawKey[] };
  errors?: { message: string }[];
};

export type MemberKey = {
  owner: Hex;
  tokenId: string;
  /** uint256.max for "never expires" */
  expiration: bigint;
  createdAtBlock: bigint;
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
    queryFn: async (): Promise<MemberKey[]> => {
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
      return keys
        .filter((k) => isAddress(k.owner))
        .map<MemberKey>((k) => ({
          owner: k.owner.toLowerCase() as Hex,
          tokenId: k.tokenId,
          expiration: BigInt(k.expiration),
          createdAtBlock: BigInt(k.createdAtBlock),
        }));
    },
  });

  const members = useMemo(
    () => query.data ?? ([] as readonly MemberKey[]),
    [query.data],
  );

  /** Backward-compat: deduped list of owner addresses. */
  const owners = useMemo<readonly Hex[]>(() => {
    const set = new Set<string>();
    for (const m of members) set.add(m.owner);
    return Array.from(set) as Hex[];
  }, [members]);

  return {
    owners,
    members,
    total: owners.length,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

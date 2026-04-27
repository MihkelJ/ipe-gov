import { useMemo } from "react";
import type { Address, Hex } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { UnlockConfidentialGovernorLiquidABI, addresses } from "@ipe-gov/sdk";

export type AuthoredProposal = {
  id: bigint;
  proposer: Hex;
  startBlock: bigint;
  endBlock: bigint;
  finalized: boolean;
  descriptionCid: string;
};

export type AuthoredProposals = {
  data: readonly AuthoredProposal[];
  isLoading: boolean;
};

/** Proposals authored by `author`. Reads `proposalCount`, then multicalls
 *  `getProposal` for every id and filters by `proposer`. The pilot has a
 *  single-digit number of proposals; if that grows we should switch to a
 *  log-filter or subgraph-backed index. */
export function useProposalsByAuthor(author: Address | undefined): AuthoredProposals {
  const { data: count, isLoading: countLoading } = useReadContract({
    address: addresses.sepolia.governorLiquid as Hex,
    abi: UnlockConfidentialGovernorLiquidABI,
    functionName: "proposalCount",
  });

  const total = count ? Number(count) : 0;
  const ids = useMemo(() => Array.from({ length: total }, (_, i) => BigInt(total - i)), [total]);

  const { data, isLoading } = useReadContracts({
    contracts: ids.map((id) => ({
      address: addresses.sepolia.governorLiquid as Hex,
      abi: UnlockConfidentialGovernorLiquidABI,
      functionName: "getProposal" as const,
      args: [id] as const,
    })),
    query: { enabled: total > 0 && Boolean(author) },
  });

  const filtered = useMemo<readonly AuthoredProposal[]>(() => {
    if (!data || !author) return [];
    const lower = author.toLowerCase();
    const out: AuthoredProposal[] = [];
    data.forEach((r, i) => {
      if (r.status !== "success" || !r.result) return;
      const [proposer, startBlock, endBlock, , , , finalized, descriptionCid] = r.result as readonly [
        Hex,
        bigint,
        bigint,
        Hex,
        Hex,
        Hex,
        boolean,
        string,
      ];
      if (proposer.toLowerCase() !== lower) return;
      out.push({
        id: ids[i],
        proposer,
        startBlock,
        endBlock,
        finalized,
        descriptionCid,
      });
    });
    return out;
  }, [data, author, ids]);

  return { data: filtered, isLoading: countLoading || isLoading };
}

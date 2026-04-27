import { useMemo } from "react";
import { zeroAddress, type Address, type Hex } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { LiquidDelegationABI, UnlockConfidentialGovernorLiquidABI, addresses } from "@ipe-gov/sdk";

export type MemberActivityRow = {
  proposalId: bigint;
  /** Who `address` delegates to on this proposal, or undefined if none. */
  delegatedTo?: Hex;
  /** Direct delegators *to* `address` on this proposal (one hop). */
  delegatorsIn: readonly Hex[];
  /** True if `address` has cast a direct ballot on this proposal. */
  votedDirectly: boolean;
  /** Delegate that already covered `address`'s ballot, or undefined. */
  countedBy?: Hex;
};

export type MemberActivity = {
  rows: readonly MemberActivityRow[];
  isLoading: boolean;
};

/** Per-proposal voting/delegation activity for `address`. Iterates every
 *  proposal once via `proposalCount` and multicalls four reads per proposal
 *  in a single batch. Empty rows are filtered out by callers. */
export function useMemberActivity(address: Address | undefined): MemberActivity {
  const { data: count, isLoading: countLoading } = useReadContract({
    address: addresses.sepolia.governorLiquid as Hex,
    abi: UnlockConfidentialGovernorLiquidABI,
    functionName: "proposalCount",
  });

  const total = count ? Number(count) : 0;
  const ids = useMemo(() => Array.from({ length: total }, (_, i) => BigInt(total - i)), [total]);

  const contracts = useMemo(() => {
    if (!address || total === 0) return [];
    return ids.flatMap((id) => [
      {
        address: addresses.sepolia.liquidDelegation as Hex,
        abi: LiquidDelegationABI,
        functionName: "delegateOf" as const,
        args: [address, id] as const,
      },
      {
        address: addresses.sepolia.liquidDelegation as Hex,
        abi: LiquidDelegationABI,
        functionName: "delegatorsOf" as const,
        args: [address, id] as const,
      },
      {
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
        functionName: "hasDirectlyVoted" as const,
        args: [id, address] as const,
      },
      {
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
        functionName: "countedBy" as const,
        args: [id, address] as const,
      },
    ]);
  }, [address, ids, total]);

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  const rows = useMemo<readonly MemberActivityRow[]>(() => {
    if (!data || ids.length === 0) return [];
    const out: MemberActivityRow[] = [];
    for (let i = 0; i < ids.length; i++) {
      const base = i * 4;
      const delegatedToRaw = data[base]?.result as Hex | undefined;
      const delegatorsInRaw = data[base + 1]?.result as readonly Hex[] | undefined;
      const votedDirectly = data[base + 2]?.result as boolean | undefined;
      const countedByRaw = data[base + 3]?.result as Hex | undefined;
      const delegatedTo = delegatedToRaw && delegatedToRaw !== zeroAddress ? delegatedToRaw : undefined;
      const countedBy = countedByRaw && countedByRaw !== zeroAddress ? countedByRaw : undefined;
      out.push({
        proposalId: ids[i],
        delegatedTo,
        delegatorsIn: delegatorsInRaw ?? [],
        votedDirectly: votedDirectly ?? false,
        countedBy,
      });
    }
    return out;
  }, [data, ids]);

  return { rows, isLoading: countLoading || isLoading };
}

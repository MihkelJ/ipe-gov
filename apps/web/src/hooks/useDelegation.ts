import { useMemo } from "react";
import { zeroAddress, type Hex } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { DELEGATION_ABI, DELEGATION_ADDRESS } from "../lib/delegation";
import { GOVERNOR_ABI, GOVERNOR_ADDRESS } from "../lib/governor";
import { LOCK_ABI, LOCK_ADDRESS } from "../lib/lock";

/** Matches `UnlockConfidentialGovernorLiquid.MAX_DELEGATORS_PER_CALL`. */
export const DELEGATE_BATCH_SIZE = 64;

/** Read cap for the claimability view. Higher than the batch size so the UI
 *  can truthfully say "you have N claimable, run again" rather than silently
 *  hiding overflow. */
const TRANSITIVE_DISPLAY_CAP = 256n;

/** Current delegatee of `voter` for `proposalId`, or zero address if none. */
export function useMyDelegate(proposalId: bigint, voter: Hex | undefined) {
  return useReadContract({
    address: DELEGATION_ADDRESS,
    abi: DELEGATION_ABI,
    functionName: "delegateOf",
    args: voter ? [voter, proposalId] : undefined,
    query: { enabled: Boolean(voter) },
  });
}

/** Is `voter` a current Unlock key holder? */
export function useIsMember(voter: Hex | undefined) {
  return useReadContract({
    address: LOCK_ADDRESS,
    abi: LOCK_ABI,
    functionName: "getHasValidKey",
    args: voter ? [voter] : undefined,
    query: { enabled: Boolean(voter) },
  });
}

export type Claimability = {
  all: readonly Hex[];
  claimable: readonly Hex[];
  excluded: readonly Hex[];
  isLoading: boolean;
  refetch: () => Promise<unknown>;
};

/** Split transitive delegators into those the delegate can actually claim and
 *  those that would revert `castVoteAsDelegate` because they have already
 *  voted directly or been credited through a different path. The governor
 *  reverts atomically on any single bad entry — filtering client-side turns
 *  an opaque RPC error into a truthful "N of M claimable" UI. */
export function useClaimableDelegators(
  proposalId: bigint,
  delegatee: Hex | undefined,
): Claimability {
  const transitive = useReadContract({
    address: DELEGATION_ADDRESS,
    abi: DELEGATION_ABI,
    functionName: "collectTransitive",
    args: delegatee ? [delegatee, proposalId, TRANSITIVE_DISPLAY_CAP] : undefined,
    query: { enabled: Boolean(delegatee) },
  });

  const all = (transitive.data ?? []) as readonly Hex[];

  const contracts = useMemo(
    () =>
      all.flatMap((d) => [
        {
          address: GOVERNOR_ADDRESS,
          abi: GOVERNOR_ABI,
          functionName: "hasDirectlyVoted",
          args: [proposalId, d],
        } as const,
        {
          address: GOVERNOR_ADDRESS,
          abi: GOVERNOR_ABI,
          functionName: "countedBy",
          args: [proposalId, d],
        } as const,
        // Liquid delegation is transitive: `_delegators` only tracks one hop,
        // but `resolveTerminal` walks the full chain. If the caller delegated
        // onwards, their direct delegators' terminal has moved past them, and
        // the governor would revert `InvalidDelegator` at claim time. Filter
        // here so the UI only shows delegators the caller can actually claim.
        {
          address: DELEGATION_ADDRESS,
          abi: DELEGATION_ABI,
          functionName: "resolveTerminal",
          args: [d, proposalId],
        } as const,
      ]),
    [all, proposalId],
  );

  const status = useReadContracts({
    contracts,
    query: { enabled: all.length > 0 },
  });

  const { claimable, excluded } = useMemo(() => {
    if (all.length === 0 || !status.data) {
      return { claimable: [] as Hex[], excluded: [] as Hex[] };
    }
    const delegateeLower = delegatee?.toLowerCase();
    const claimableOut: Hex[] = [];
    const excludedOut: Hex[] = [];
    for (let i = 0; i < all.length; i++) {
      const directlyVoted = status.data[i * 3]?.result as boolean | undefined;
      const countedBy = status.data[i * 3 + 1]?.result as Hex | undefined;
      const terminal = status.data[i * 3 + 2]?.result as Hex | undefined;
      const terminalMatches =
        terminal && delegateeLower && terminal.toLowerCase() === delegateeLower;
      const isClaimable =
        directlyVoted === false && countedBy === zeroAddress && terminalMatches;
      (isClaimable ? claimableOut : excludedOut).push(all[i]);
    }
    return { claimable: claimableOut, excluded: excludedOut };
  }, [all, status.data, delegatee]);

  return {
    all,
    claimable,
    excluded,
    isLoading: transitive.isLoading || status.isLoading,
    refetch: async () => {
      await Promise.all([transitive.refetch(), status.refetch()]);
    },
  };
}

export type DelegationTargetReason = "self" | "non-member" | "cycle" | "too-deep";

export type DelegationTargetCheck =
  | { ok: true; reason: undefined; isLoading: false }
  | { ok: false; reason: DelegationTargetReason | undefined; isLoading: boolean };

/** Pre-flight validation for a `delegate()` target. Returns structured reasons
 *  so the UI can show inline errors ("target isn't a member", "that would
 *  cycle") instead of bubbling up raw RPC errors from the revert. */
export function useDelegationTargetCheck(
  proposalId: bigint,
  voter: Hex | undefined,
  target: Hex | undefined,
): DelegationTargetCheck {
  const normalizedVoter = voter?.toLowerCase();
  const normalizedTarget = target?.toLowerCase();
  const enabled = Boolean(voter && target && target !== zeroAddress);
  const isSelf = Boolean(normalizedVoter && normalizedTarget && normalizedVoter === normalizedTarget);

  const member = useReadContract({
    address: LOCK_ADDRESS,
    abi: LOCK_ABI,
    functionName: "getHasValidKey",
    args: target ? [target] : undefined,
    query: { enabled: enabled && !isSelf },
  });

  const terminal = useReadContract({
    address: DELEGATION_ADDRESS,
    abi: DELEGATION_ABI,
    functionName: "resolveTerminal",
    args: target ? [target, proposalId] : undefined,
    query: { enabled: enabled && !isSelf },
  });

  if (!enabled) return { ok: false, reason: undefined, isLoading: false };
  if (isSelf) return { ok: false, reason: "self", isLoading: false };
  if (member.isLoading || terminal.isLoading) {
    return { ok: false, reason: undefined, isLoading: true };
  }
  if (member.data === false) return { ok: false, reason: "non-member", isLoading: false };
  // `resolveTerminal` returns address(0) exactly when the chain would exceed
  // MAX_CHAIN_DEPTH — delegating would revert with ChainTooDeep.
  if (terminal.data === zeroAddress) return { ok: false, reason: "too-deep", isLoading: false };
  const terminalAddr = (terminal.data as Hex | undefined)?.toLowerCase();
  if (terminalAddr && normalizedVoter && terminalAddr === normalizedVoter) {
    return { ok: false, reason: "cycle", isLoading: false };
  }
  return { ok: true, reason: undefined, isLoading: false };
}

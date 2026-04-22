import type { Hex } from "viem";
import { useBlockNumber, useReadContract } from "wagmi";
import { GOVERNOR_ABI, GOVERNOR_ADDRESS } from "./governor";

export type ProposalHandles = {
  forVotes: Hex;
  againstVotes: Hex;
  abstainVotes: Hex;
};

export type ProposalState = {
  isLoading: boolean;
  proposer?: Hex;
  startBlock?: bigint;
  endBlock?: bigint;
  handles?: ProposalHandles;
  finalized: boolean;
  votingClosed: boolean;
  descriptionCid?: string;
  refetch: () => Promise<unknown>;
};

/** Central hook for proposal state. Wagmi + react-query dedupe identical reads
 *  across consumers, so calling this in multiple components is cheap. */
export function useProposal(id: bigint): ProposalState {
  const { data, isLoading, refetch } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: GOVERNOR_ABI,
    functionName: "getProposal",
    args: [id],
  });

  const { data: currentBlock } = useBlockNumber({ watch: true });

  if (!data) {
    return { isLoading, finalized: false, votingClosed: false, refetch };
  }

  const [
    proposer,
    startBlock,
    endBlock,
    forVotes,
    againstVotes,
    abstainVotes,
    finalized,
    descriptionCid,
  ] = data;

  return {
    isLoading,
    proposer,
    startBlock,
    endBlock,
    handles: { forVotes, againstVotes, abstainVotes },
    finalized,
    votingClosed: currentBlock !== undefined && currentBlock > endBlock,
    descriptionCid,
    refetch,
  };
}

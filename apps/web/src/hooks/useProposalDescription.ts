import { useQuery } from "@tanstack/react-query";
import { fetchProposalDescription, type ProposalBody } from "@ipe-gov/ipfs";

/** Fetches a pinned proposal description from an IPFS gateway. Cached forever
 *  per CID since pinned content is immutable. */
export function useProposalDescription(cid: string | undefined): {
  text: string | undefined;
  body: ProposalBody | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ["proposal-description", cid],
    queryFn: () => fetchProposalDescription(cid!),
    enabled: Boolean(cid),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return {
    text: data?.text,
    body: data?.body,
    isLoading,
    error: error as Error | null,
  };
}

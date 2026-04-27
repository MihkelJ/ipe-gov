import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { fetchSubnameIdentity, type SubnameIdentity } from "#/lib/ensApi";

const SUBNAME_STALE_MS = 60_000;
const SUBNAME_GC_MS = 5 * 60_000;

/** Resolve an address to its current subname under the configured parent.
 *  Returns `null` when there's no live claim. Includes text records, so
 *  callers (e.g. the profile editor) can pre-populate input fields. */
export function useSubnameIdentity(address: Address | undefined) {
  return useQuery<SubnameIdentity | null>({
    queryKey: ["subname-identity", address?.toLowerCase()],
    enabled: !!address,
    staleTime: SUBNAME_STALE_MS,
    gcTime: SUBNAME_GC_MS,
    queryFn: ({ signal }) => fetchSubnameIdentity(address!, signal),
  });
}

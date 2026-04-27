import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAvailability, type AvailabilityResponse } from "#/lib/ensApi";

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MIN_LABEL_LEN = 3;
const MAX_LABEL_LEN = 32;

/** Same shape rule the registrar enforces on-chain — keep in sync.
 *  Returns the normalized label if it passes, or null to signal "don't even
 *  bother calling the API". */
export function normalizeLabelInput(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < MIN_LABEL_LEN) return null;
  if (trimmed.length > MAX_LABEL_LEN) return null;
  if (!LABEL_RE.test(trimmed)) return null;
  return trimmed;
}

export type AvailabilityState =
  | { status: "idle" }
  | { status: "invalid"; reason: string }
  | { status: "loading"; label: string }
  | { status: "available"; label: string }
  | { status: "taken"; label: string }
  | { status: "error"; label: string; error: string };

export function useSubnameAvailability(rawLabel: string): AvailabilityState {
  const [debounced, setDebounced] = useState(rawLabel);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(rawLabel), 250);
    return () => clearTimeout(t);
  }, [rawLabel]);

  const normalized = normalizeLabelInput(debounced);

  const query = useQuery<AvailabilityResponse>({
    queryKey: ["ens-available", normalized],
    enabled: normalized !== null,
    staleTime: 10_000,
    queryFn: ({ signal }) => fetchAvailability(normalized!, signal),
  });

  if (!debounced) return { status: "idle" };
  if (!normalized) {
    return { status: "invalid", reason: invalidReason(debounced) };
  }
  if (query.isPending || query.isFetching) return { status: "loading", label: normalized };
  if (query.error) return { status: "error", label: normalized, error: String(query.error) };
  if (query.data?.available) return { status: "available", label: normalized };
  return { status: "taken", label: normalized };
}

function invalidReason(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < MIN_LABEL_LEN) return `too short (min ${MIN_LABEL_LEN})`;
  if (trimmed.length > MAX_LABEL_LEN) return `too long (max ${MAX_LABEL_LEN})`;
  return "use a-z, 0-9, or hyphens (no leading/trailing hyphen)";
}

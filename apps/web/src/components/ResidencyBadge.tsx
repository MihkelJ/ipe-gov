import { useEffect, useState } from "react";
import { getAddress, type Hex } from "viem";
import { useAccount } from "wagmi";

import { useIsAttesterAdmin } from "#/hooks/eas/useIsAttesterAdmin";
import { useResidencyOf } from "#/hooks/eas/useResidencyOf";
import { useRevokeAttestation } from "#/hooks/eas/useRevokeAttestation";
import { cn } from "#/lib/utils";

import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";

// Renders an "Onchain resident" pill if the address has a non-revoked
// IpeResident attestation issued by a trusted attester. When the connected
// wallet is the original attester, an inline "Revoke" affordance appears
// next to the badge — two-click confirm protects against accidents without
// stealing focus into a modal.
export function ResidencyBadge({ address }: { address: Hex }) {
  const { data, isLoading } = useResidencyOf(address);
  const { address: connected } = useAccount();
  const isAdmin = useIsAttesterAdmin();
  const revoke = useRevokeAttestation("IpeResident");

  const [confirming, setConfirming] = useState(false);
  // Auto-defuse the confirm state after 4s so a primed button doesn't sit
  // waiting indefinitely (defensive against the user wandering away).
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (isLoading) return <Skeleton className="h-5 w-32" />;
  if (!data) return null;

  const sinceLabel = formatSince(data.since);
  const canRevoke = isAdmin && connected != null && getAddress(data.attester) === getAddress(connected);

  const handleRevoke = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    try {
      await revoke.mutateAsync({ uid: data.attestationId, recipient: address });
    } catch {
      // surfaced via revoke.error below
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary" className="font-mono text-[11px] uppercase tracking-[0.16em]">
        Resident{sinceLabel ? ` · ${sinceLabel}` : ""}
      </Badge>
      {canRevoke ? (
        <button
          type="button"
          onClick={handleRevoke}
          disabled={revoke.isPending}
          aria-label={confirming ? "Confirm residency revocation" : "Revoke residency attestation"}
          title={confirming ? "Click again within 4s to confirm" : "Revoke residency attestation"}
          className={cn(
            "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
            "disabled:opacity-60",
            confirming
              ? "border-destructive bg-destructive text-background"
              : "border-foreground/30 bg-background text-muted-foreground hover:border-destructive hover:text-destructive",
          )}
        >
          {revoke.isPending ? "Revoking…" : confirming ? "Confirm ✕" : "Revoke"}
        </button>
      ) : null}
      {revoke.error ? (
        <span className="font-mono text-[10px] tracking-[0.06em] text-destructive">
          ! {revoke.error instanceof Error ? revoke.error.message : String(revoke.error)}
        </span>
      ) : null}
    </span>
  );
}

function formatSince(unixSeconds: number): string | null {
  if (!unixSeconds) return null;
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

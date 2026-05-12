import { useAccount } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { Badge } from "#/components/ui/badge";
import { useMembership } from "#/hooks/useMembership";

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Compact membership status pill for the header. Maps the four real states
 *  to four shadcn Badge variants. */
export function MembershipBadge() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const { isMember, isLoading } = useMembership(address);

  if (!ready) return <Badge variant="outline">Loading…</Badge>;
  if (!authenticated || !address) return <Badge variant="outline">Not connected</Badge>;
  if (isLoading) return <Badge variant="outline">Checking…</Badge>;
  if (!isMember) return <Badge variant="destructive">Not a member · {truncate(address)}</Badge>;
  return <Badge>Member · {truncate(address)}</Badge>;
}

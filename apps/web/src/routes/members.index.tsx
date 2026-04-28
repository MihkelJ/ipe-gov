import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Copy, Search } from "lucide-react";
import { formatUnits, type Hex } from "viem";
import RequireUnlockMembership from "#/components/RequireUnlockMembership";
import { useAllMembers, type MemberKey } from "#/hooks/useMembers";
import { useMemberBalances } from "#/hooks/useMemberBalances";
import { tokens } from "@ipe-gov/sdk";
import { AddressIdentity } from "#/components/AddressIdentity";
import { useClaimedSubnames, useIpecitySubnames } from "#/hooks/useIdentity";
import { Input } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Skeleton } from "#/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "#/components/ui/pagination";

export const Route = createFileRoute("/members/")({
  head: () => ({ meta: [{ title: "Members — ipe-gov" }] }),
  component: MembersGuarded,
});

function MembersGuarded() {
  return (
    <RequireUnlockMembership>
      <Members />
    </RequireUnlockMembership>
  );
}

type Filter = "all" | "active" | "expiring";
const PAGE_SIZE = 20;
// Keys with expiration this far in the future are treated as "Never" —
// Unlock uses uint256.max for non-expiring keys, which is vastly larger
// than any plausible future epoch second.
const NEVER_THRESHOLD = BigInt(Number.MAX_SAFE_INTEGER);
const THIRTY_DAYS = 60n * 60n * 24n * 30n;

function Members() {
  const { data: members = [], isLoading, error, refetch } = useAllMembers();
  const total = members.length;
  const { data: claimedSubnames } = useClaimedSubnames();
  const { data: ipecitySubnames } = useIpecitySubnames();
  const { balances, isLoading: balancesLoading } = useMemberBalances(members);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  const nowSec = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), []);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = members.filter((m) => {
      if (query.length > 0) {
        const addr = m.owner.toLowerCase();
        // Search across both name sources `useIdentity` falls through to —
        // L2 govdemo subnames AND legacy *.ipecity.eth wrapped subnames.
        // Without the second source, a member whose dossier shows
        // `alice.ipecity.eth` is invisible to a search for "alice", which
        // reads as "the person isn't on this page" even though they're in
        // the list. Mainnet ENS reverse names aren't indexed yet — that's
        // an N-RPC fetch we haven't taken on.
        const claimed = claimedSubnames?.get(addr)?.toLowerCase();
        const ipecity = ipecitySubnames?.get(addr)?.toLowerCase();
        if (!addr.includes(query) && !claimed?.includes(query) && !ipecity?.includes(query)) {
          return false;
        }
      }
      if (filter === "expiring") {
        if (m.expiration >= NEVER_THRESHOLD) return false;
        return m.expiration - nowSec < THIRTY_DAYS;
      }
      return true;
    });
    // Sort by IPE balance desc; unknown balances sink to the bottom, with
    // tokenId asc as the tiebreaker so ordering stays stable for zero/unknown.
    return [...filtered].sort((a, b) => {
      const ba = balances.get(a.owner.toLowerCase() as Hex);
      const bb = balances.get(b.owner.toLowerCase() as Hex);
      if (ba === undefined && bb === undefined) {
        return Number(BigInt(a.tokenId) - BigInt(b.tokenId));
      }
      if (ba === undefined) return 1;
      if (bb === undefined) return -1;
      if (ba === bb) return Number(BigInt(a.tokenId) - BigInt(b.tokenId));
      return bb > ba ? 1 : -1;
    });
  }, [members, claimedSubnames, ipecitySubnames, q, filter, nowSec, balances]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * PAGE_SIZE;
  const paged = visible.slice(offset, offset + PAGE_SIZE);

  return (
    <TooltipProvider>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <header className="mb-8 border-b border-border pb-5 sm:mb-12 sm:pb-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            The Register · Sepolia
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Members</h1>
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground sm:pb-2 sm:text-xs">
              {total} {total === 1 ? "key holder" : "key holders"}
            </div>
          </div>
        </header>

        <div className="mt-8 mb-6 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative w-full sm:max-w-xs sm:flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Filter by name or address…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="h-9 pl-8 font-mono text-xs"
            />
          </div>
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setPage(1);
            }}
            className="w-full sm:w-auto"
          >
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="all" className="flex-1 sm:flex-none">
                All
              </TabsTrigger>
              <TabsTrigger value="active" className="flex-1 sm:flex-none">
                Active
              </TabsTrigger>
              <TabsTrigger value="expiring" className="flex-1 sm:flex-none">
                Expiring
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {error ? (
          <ErrorRow error={error} onRetry={refetch} />
        ) : isLoading ? (
          <RegisterSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState hasQuery={q.length > 0 || filter !== "all"} />
        ) : (
          <>
            <RegisterLedger
              members={paged}
              startIndex={offset}
              nowSec={nowSec}
              balances={balances}
              balancesLoading={balancesLoading}
            />
            {pageCount > 1 ? <RegisterPagination page={safePage} pageCount={pageCount} onPage={setPage} /> : null}
            <div className="mt-3 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, visible.length)} of {visible.length}
            </div>
          </>
        )}
      </main>
    </TooltipProvider>
  );
}

function RegisterLedger({
  members,
  startIndex,
  nowSec,
  balances,
  balancesLoading,
}: {
  members: readonly MemberKey[];
  startIndex: number;
  nowSec: bigint;
  balances: Map<Hex, bigint>;
  balancesLoading: boolean;
}) {
  return (
    <ol className="divide-y divide-border border-y border-border">
      {members.map((m, i) => (
        <LedgerRow
          key={`${m.tokenId}-${m.owner}`}
          index={startIndex + i + 1}
          member={m}
          nowSec={nowSec}
          balance={balances.get(m.owner.toLowerCase() as Hex)}
          balancesLoading={balancesLoading}
        />
      ))}
    </ol>
  );
}

function LedgerRow({
  index,
  member,
  nowSec,
  balance,
  balancesLoading,
}: {
  index: number;
  member: MemberKey;
  nowSec: bigint;
  balance: bigint | undefined;
  balancesLoading: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const expires = describeExpiry(member.expiration, nowSec);
  const tone: BadgeTone = expires.soon ? "expiring" : "active";

  async function copyAddress(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(member.owner);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* swallow */
    }
  }

  const expiresLabel = expires.label === "Never" ? "never expires" : expires.label;

  return (
    <li className="group relative">
      <Link
        to="/members/$address"
        params={{ address: member.owner }}
        className="flex items-start gap-4 px-1 py-5 pr-1 transition-colors hover:bg-accent/40 sm:gap-6 sm:py-6 sm:pr-20"
      >
        <span
          className="shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground sm:w-10 sm:pt-1 sm:text-sm"
          aria-hidden
        >
          <span className="sm:hidden">{String(index).padStart(2, "0")}</span>
          <span className="hidden sm:inline">{String(index).padStart(2, "0")}.</span>
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:justify-start">
            <div className="min-w-0 flex-1 sm:flex-initial">
              <AddressIdentity address={member.owner} size="sm" />
            </div>
            <span className="sm:hidden">
              <StatusBadge tone={tone} />
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-20 font-mono text-[11px] text-muted-foreground sm:flex-1 sm:flex-nowrap sm:justify-end sm:gap-x-5 sm:pr-0 sm:text-xs">
            <span className="tabular-nums">
              {balance !== undefined ? (
                <>
                  {formatToken(balance, tokens.base.ipe.decimals)}{" "}
                  <span className="text-muted-foreground/70">{tokens.base.ipe.symbol}</span>
                </>
              ) : balancesLoading ? (
                <Skeleton className="inline-block h-3 w-14 align-middle" />
              ) : (
                <span>— {tokens.base.ipe.symbol}</span>
              )}
            </span>
            <span className="text-muted-foreground/40" aria-hidden>
              ·
            </span>
            <span>{expiresLabel}</span>
          </div>

          <div className="hidden sm:block">
            <StatusBadge tone={tone} />
          </div>
        </div>
      </Link>

      <div className="absolute right-1 bottom-4 flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100 sm:top-1/2 sm:right-2 sm:bottom-auto sm:-translate-y-1/2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={copyAddress}
              aria-label={copied ? "Copied" : "Copy address"}
            >
              <Copy className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : "Copy address"}</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}

type BadgeTone = "active" | "expiring";

function StatusBadge({ tone }: { tone: BadgeTone }) {
  const label = tone === "active" ? "Active" : "Expiring soon";
  // Vary only border weight & text opacity — no new color tokens.
  const chrome = tone === "active" ? "border-border text-muted-foreground" : "border-foreground/80 text-foreground";
  return (
    <Badge variant="outline" className={`rounded-none font-mono text-[10px] uppercase tracking-[0.16em] ${chrome}`}>
      {label}
    </Badge>
  );
}

function RegisterPagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  const pages = pageRange(page, pageCount);
  return (
    <Pagination className="mt-6">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={page === 1}
            className={page === 1 ? "pointer-events-none opacity-40" : ""}
            onClick={(e) => {
              e.preventDefault();
              if (page > 1) onPage(page - 1);
            }}
          />
        </PaginationItem>
        <PaginationItem className="sm:hidden">
          <span className="px-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {page} / {pageCount}
          </span>
        </PaginationItem>
        {pages.map((p) => (
          <PaginationItem key={p} className="hidden sm:list-item">
            <PaginationLink
              href="#"
              isActive={p === page}
              onClick={(e) => {
                e.preventDefault();
                onPage(p);
              }}
            >
              {p}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={page === pageCount}
            className={page === pageCount ? "pointer-events-none opacity-40" : ""}
            onClick={(e) => {
              e.preventDefault();
              if (page < pageCount) onPage(page + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function RegisterSkeleton() {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-start gap-4 px-1 py-5 sm:gap-6 sm:py-6">
          <Skeleton className="h-3 w-6 shrink-0 sm:mt-1 sm:w-10" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-32 sm:w-40" />
            </div>
            <div className="flex items-center gap-2 sm:flex-1 sm:justify-end">
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="hidden h-5 w-20 sm:block" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <Empty className="border border-dashed border-border">
      <EmptyHeader>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">The register</div>
        <EmptyTitle>{hasQuery ? "No members match your filter" : "The register is empty"}</EmptyTitle>
        <EmptyDescription>
          {hasQuery
            ? "Try a shorter prefix, or reset the filter to view the full roster."
            : "No valid key holders were found for the configured lock."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ErrorRow({ error, onRetry }: { error: unknown; onRetry: () => Promise<unknown> }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <Empty className="border border-dashed border-border">
      <EmptyHeader>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Subgraph error</div>
        <EmptyTitle>Couldn't load the register</EmptyTitle>
        <EmptyDescription className="font-mono text-xs break-all">{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void onRetry();
          }}
        >
          Retry
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function describeExpiry(expiration: bigint, nowSec: bigint): { label: string; soon: boolean } {
  if (expiration >= NEVER_THRESHOLD) return { label: "Never", soon: false };
  const remaining = expiration - nowSec;
  if (remaining <= 0n) return { label: "Expired", soon: true };
  const soon = remaining < THIRTY_DAYS;
  return { label: `in ${formatDuration(remaining)}`, soon };
}

function formatDuration(seconds: bigint): string {
  const s = Number(seconds);
  const day = 60 * 60 * 24;
  if (s < 60) return `${s}s`;
  if (s < 60 * 60) return `${Math.floor(s / 60)}m`;
  if (s < day) return `${Math.floor(s / 3600)}h`;
  const days = Math.floor(s / day);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 365) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"}`;
}

function formatToken(amount: bigint, decimals: number): string {
  if (amount === 0n) return "0";
  const num = Number(formatUnits(amount, decimals));
  if (num > 0 && num < 0.01) return "<0.01";
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function pageRange(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current - 1, current, current + 1]);
  return Array.from(set)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
}

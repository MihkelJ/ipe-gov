import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Copy, ExternalLink, Search } from 'lucide-react'
import type { Hex } from 'viem'
import RequireUnlockMembership from '#/components/RequireUnlockMembership'
import { useAllMembers, type MemberKey } from '#/hooks/useMembers'
import { useMemberBalances } from '#/hooks/useMemberBalances'
import { tokens } from '@ipe-gov/sdk'
import { AddressIdentity } from '#/components/AddressIdentity'
import { useIpecitySubnames } from '#/hooks/useIdentity'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '#/components/ui/pagination'

export const Route = createFileRoute('/members/')({
  head: () => ({ meta: [{ title: 'Members — ipe-gov' }] }),
  component: MembersGuarded,
})

function MembersGuarded() {
  return (
    <RequireUnlockMembership>
      <Members />
    </RequireUnlockMembership>
  )
}

type Filter = 'all' | 'active' | 'expiring'
const PAGE_SIZE = 20
// Keys with expiration this far in the future are treated as "Never" —
// Unlock uses uint256.max for non-expiring keys, which is vastly larger
// than any plausible future epoch second.
const NEVER_THRESHOLD = BigInt(Number.MAX_SAFE_INTEGER)
const THIRTY_DAYS = 60n * 60n * 24n * 30n

function Members() {
  const { data: members = [], isLoading, error, refetch } = useAllMembers()
  const total = members.length
  const { data: subnames } = useIpecitySubnames()
  const {
    balances,
    isLoading: balancesLoading,
    isError: balancesError,
  } = useMemberBalances(members)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)

  const nowSec = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), [])

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    const filtered = members.filter((m) => {
      if (query.length > 0) {
        const addr = m.owner.toLowerCase()
        const name = subnames?.get(addr)?.toLowerCase()
        if (!addr.includes(query) && !name?.includes(query)) return false
      }
      if (filter === 'expiring') {
        if (m.expiration >= NEVER_THRESHOLD) return false
        return m.expiration - nowSec < THIRTY_DAYS
      }
      return true
    })
    // Sort by IPE balance desc; unknown balances sink to the bottom, with
    // tokenId asc as the tiebreaker so ordering stays stable for zero/unknown.
    return [...filtered].sort((a, b) => {
      const ba = balances.get(a.owner.toLowerCase() as Hex)
      const bb = balances.get(b.owner.toLowerCase() as Hex)
      if (ba === undefined && bb === undefined) {
        return Number(BigInt(a.tokenId) - BigInt(b.tokenId))
      }
      if (ba === undefined) return 1
      if (bb === undefined) return -1
      if (ba === bb) return Number(BigInt(a.tokenId) - BigInt(b.tokenId))
      return bb > ba ? 1 : -1
    })
  }, [members, subnames, q, filter, nowSec, balances])

  const expiringSoon = useMemo(
    () =>
      members.filter(
        (m) =>
          m.expiration < NEVER_THRESHOLD &&
          m.expiration - nowSec < THIRTY_DAYS,
      ).length,
    [members, nowSec],
  )

  const newestBlock = useMemo(
    () => (members.length > 0 ? members[0].createdAtBlock : null),
    [members],
  )

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const offset = (safePage - 1) * PAGE_SIZE
  const paged = visible.slice(offset, offset + PAGE_SIZE)

  return (
    <TooltipProvider>
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-12">
        <header className="mb-12 flex items-end justify-between gap-6 border-b border-border pb-6">
          <div>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              The Register · Sepolia
            </div>
            <h1 className="text-5xl font-semibold tracking-tight">Members</h1>
          </div>
          <div className="pb-2 text-right font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {total} {total === 1 ? 'key holder' : 'key holders'}
          </div>
        </header>

        <section className="mb-10 grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat label="Active keys" value={total.toLocaleString()} />
          <Stat label="Expiring ≤ 30d" value={expiringSoon.toLocaleString()} />
          <Stat
            label="Newest block"
            value={newestBlock !== null ? newestBlock.toLocaleString() : '—'}
          />
        </section>

        <div className="mb-6 flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
          <div className="relative max-w-xs flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Filter by name or address…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              className="h-9 pl-8 font-mono text-xs"
            />
          </div>
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter)
              setPage(1)
            }}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="expiring">Expiring</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {error ? (
          <ErrorRow error={error} onRetry={refetch} />
        ) : isLoading ? (
          <RegisterSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState hasQuery={q.length > 0 || filter !== 'all'} />
        ) : (
          <>
            <RegisterTable
              members={paged}
              startIndex={offset}
              nowSec={nowSec}
              balances={balances}
              balancesLoading={balancesLoading}
              balancesError={balancesError}
            />
            {pageCount > 1 ? (
              <RegisterPagination
                page={safePage}
                pageCount={pageCount}
                onPage={setPage}
              />
            ) : null}
            <div className="mt-3 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, visible.length)} of{' '}
              {visible.length}
            </div>
          </>
        )}
      </main>
    </TooltipProvider>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-4 py-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function RegisterTable({
  members,
  startIndex,
  nowSec,
  balances,
  balancesLoading,
  balancesError,
}: {
  members: readonly MemberKey[]
  startIndex: number
  nowSec: bigint
  balances: Map<Hex, bigint>
  balancesLoading: boolean
  balancesError: boolean
}) {
  return (
    <div className="border-y border-border">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="w-14 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              №
            </TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Holder
            </TableHead>
            <TableHead className="hidden text-right font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:table-cell">
              {tokens.base.ipe.symbol}
            </TableHead>
            <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:table-cell">
              Key
            </TableHead>
            <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:table-cell">
              Joined
            </TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Expires
            </TableHead>
            <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m, i) => (
            <MemberRow
              key={`${m.tokenId}-${m.owner}`}
              index={startIndex + i + 1}
              member={m}
              nowSec={nowSec}
              balance={balances.get(m.owner.toLowerCase() as Hex)}
              balancesLoading={balancesLoading}
              balancesError={balancesError}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function MemberRow({
  index,
  member,
  nowSec,
  balance,
  balancesLoading,
  balancesError,
}: {
  index: number
  member: MemberKey
  nowSec: bigint
  balance: bigint | undefined
  balancesLoading: boolean
  balancesError: boolean
}) {
  const [copied, setCopied] = useState(false)
  const expires = describeExpiry(member.expiration, nowSec)
  const tone: BadgeTone = expires.soon ? 'expiring' : 'active'

  async function copy() {
    try {
      await navigator.clipboard.writeText(member.owner)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* swallow — clipboard perms may be blocked in iframe previews */
    }
  }

  return (
    <TableRow className="border-border">
      <TableCell className="py-4 align-middle font-light tabular-nums text-muted-foreground">
        {String(index).padStart(2, '0')}
      </TableCell>
      <TableCell className="py-4 align-middle">
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default">
                <AddressIdentity address={member.owner} size="sm" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="font-mono">{member.owner}</TooltipContent>
          </Tooltip>
          <div className="ml-auto flex items-center gap-1 sm:ml-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={copy}
                  aria-label="Copy address"
                >
                  <Copy className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? 'Copied' : 'Copy address'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  asChild
                  aria-label="View on Etherscan"
                >
                  <a
                    href={`https://sepolia.etherscan.io/address/${member.owner}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View on Etherscan</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden py-4 text-right align-middle font-mono text-xs tabular-nums sm:table-cell">
        {balance !== undefined ? (
          formatIpe(balance, tokens.base.ipe.decimals)
        ) : balancesLoading ? (
          <Skeleton className="ml-auto h-4 w-14" />
        ) : balancesError ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden py-4 align-middle font-mono text-xs text-muted-foreground sm:table-cell">
        #{member.tokenId}
      </TableCell>
      <TableCell className="hidden py-4 align-middle font-mono text-xs text-muted-foreground md:table-cell">
        block {member.createdAtBlock.toLocaleString()}
      </TableCell>
      <TableCell className="py-4 align-middle font-mono text-xs text-muted-foreground">
        {expires.label}
      </TableCell>
      <TableCell className="py-4 text-right align-middle">
        <StatusBadge tone={tone} />
      </TableCell>
    </TableRow>
  )
}

type BadgeTone = 'active' | 'expiring'

function StatusBadge({ tone }: { tone: BadgeTone }) {
  const label = tone === 'active' ? 'Active' : 'Expiring soon'
  // Vary only border weight & text opacity — no new color tokens.
  const chrome =
    tone === 'active'
      ? 'border-border text-muted-foreground'
      : 'border-foreground/80 text-foreground'
  return (
    <Badge
      variant="outline"
      className={`rounded-none font-mono text-[10px] uppercase tracking-[0.16em] ${chrome}`}
    >
      {label}
    </Badge>
  )
}

function RegisterPagination({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (p: number) => void
}) {
  const pages = pageRange(page, pageCount)
  return (
    <Pagination className="mt-6">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={page === 1}
            className={page === 1 ? 'pointer-events-none opacity-40' : ''}
            onClick={(e) => {
              e.preventDefault()
              if (page > 1) onPage(page - 1)
            }}
          />
        </PaginationItem>
        {pages.map((p) => (
          <PaginationItem key={p}>
            <PaginationLink
              href="#"
              isActive={p === page}
              onClick={(e) => {
                e.preventDefault()
                onPage(p)
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
            className={
              page === pageCount ? 'pointer-events-none opacity-40' : ''
            }
            onClick={(e) => {
              e.preventDefault()
              if (page < pageCount) onPage(page + 1)
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

function RegisterSkeleton() {
  return (
    <div className="border-y border-border">
      <Table>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i} className="border-border hover:bg-transparent">
              <TableCell className="py-4">
                <Skeleton className="h-4 w-6" />
              </TableCell>
              <TableCell className="py-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </TableCell>
              <TableCell className="py-4">
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell className="py-4 text-right">
                <Skeleton className="ml-auto h-5 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <Empty className="border border-dashed border-border">
      <EmptyHeader>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          The register
        </div>
        <EmptyTitle>
          {hasQuery ? 'No members match your filter' : 'The register is empty'}
        </EmptyTitle>
        <EmptyDescription>
          {hasQuery
            ? 'Try a shorter prefix, or reset the filter to view the full roster.'
            : 'No valid key holders were found for the configured lock.'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ErrorRow({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => Promise<unknown>
}) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <Empty className="border border-dashed border-border">
      <EmptyHeader>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Subgraph error
        </div>
        <EmptyTitle>Couldn't load the register</EmptyTitle>
        <EmptyDescription className="font-mono text-xs break-all">
          {message}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void onRetry()
          }}
        >
          Retry
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function describeExpiry(
  expiration: bigint,
  nowSec: bigint,
): { label: string; soon: boolean } {
  if (expiration >= NEVER_THRESHOLD) return { label: 'Never', soon: false }
  const remaining = expiration - nowSec
  if (remaining <= 0n) return { label: 'Expired', soon: true }
  const soon = remaining < THIRTY_DAYS
  return { label: `in ${formatDuration(remaining)}`, soon }
}

function formatDuration(seconds: bigint): string {
  const s = Number(seconds)
  const day = 60 * 60 * 24
  if (s < 60) return `${s}s`
  if (s < 60 * 60) return `${Math.floor(s / 60)}m`
  if (s < day) return `${Math.floor(s / 3600)}h`
  const days = Math.floor(s / day)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  if (days < 365) {
    const weeks = Math.floor(days / 7)
    return `${weeks} week${weeks === 1 ? '' : 's'}`
  }
  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? '' : 's'}`
}

function formatIpe(balance: bigint, decimals: number): string {
  if (balance === 0n) return '0'
  const num = Number(balance) / 10 ** decimals
  if (num > 0 && num < 0.01) return '<0.01'
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function pageRange(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>([1, total, current - 1, current, current + 1])
  return Array.from(set)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b)
}

import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { useMemo } from 'react'
import { formatUnits, getAddress, isAddress, type Hex } from 'viem'
import { ENS_PARENT_NAME, tokens } from '@ipe-gov/sdk'
import RequireUnlockMembership from '#/components/RequireUnlockMembership'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Skeleton } from '#/components/ui/skeleton'
import { useAllMembers, type MemberKey } from '#/hooks/useMembers'
import { useMemberBalances } from '#/hooks/useMemberBalances'
import { useEnsAvatar, useIdentity } from '#/hooks/useIdentity'
import { useEnsTextRecords } from '#/hooks/useEnsTextRecords'
import { useProposalsByAuthor, type AuthoredProposal } from '#/hooks/useProposalsByAuthor'
import { useMemberActivity, type MemberActivityRow } from '#/hooks/useMemberActivity'
import { useProposalDescription } from '#/hooks/useProposalDescription'
import { truncateAddress } from '#/lib/address'

export const Route = createFileRoute('/members/$address')({
  head: ({ params }) => ({
    meta: [{ title: `${truncateAddress(params.address as Hex)} — Member dossier` }],
  }),
  component: MemberProfileGuarded,
})

function MemberProfileGuarded() {
  return (
    <RequireUnlockMembership>
      <MemberProfilePage />
    </RequireUnlockMembership>
  )
}

const EYEBROW = 'font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground'
const NEVER_THRESHOLD = BigInt(Number.MAX_SAFE_INTEGER)
const TEXT_KEYS = ['description', 'url', 'com.twitter', 'com.github', 'email'] as const

function MemberProfilePage() {
  const { address: rawAddress } = Route.useParams()

  if (!isAddress(rawAddress)) {
    return <InvalidAddress raw={rawAddress} />
  }
  const address = getAddress(rawAddress)

  return <Dossier address={address} />
}

function InvalidAddress({ raw }: { raw: string }) {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-24 text-center">
      <div className={EYEBROW}>§ Member · Not found</div>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight">
        That doesn&rsquo;t look like an address.
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">
        <code className="font-mono">{raw}</code> isn&rsquo;t a valid 0x address.
      </p>
      <Link
        to="/members"
        className="mt-10 inline-block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to the register
      </Link>
    </main>
  )
}

function Dossier({ address }: { address: Hex }) {
  const { data: identity, isLoading: identityLoading } = useIdentity(address)
  const { data: avatarUrl } = useEnsAvatar(identity)
  const { data: members = [], isLoading: membersLoading } = useAllMembers()

  const member = useMemo<MemberKey | undefined>(
    () => members.find((m) => m.owner.toLowerCase() === address.toLowerCase()),
    [members, address],
  )
  const memberList = useMemo(() => (member ? [member] : []), [member])
  const { balances, isLoading: balanceLoading } = useMemberBalances(memberList)
  const balance = balances.get(address.toLowerCase() as Hex)

  const nowSec = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), [])
  const isLiveMember = Boolean(member) && member!.expiration > nowSec
  const status: StatusKind = identityLoading || membersLoading
    ? 'loading'
    : isLiveMember
      ? 'member'
      : member
        ? 'former'
        : 'none'

  const subname = identity && identity.endsWith(`.${ENS_PARENT_NAME}`) ? identity : undefined
  const ensName = identity && !subname ? identity : undefined

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24 pt-12 md:pt-16">
      <div className="mb-10">
        <Link
          to="/members"
          className={`${EYEBROW} transition-colors hover:text-foreground`}
        >
          ← The register
        </Link>
      </div>

      <header className="grid grid-cols-12 items-end gap-x-8 gap-y-8 border-b border-border pb-10">
        <div className="col-span-12 md:col-span-7">
          <div className={EYEBROW}>§ Member · Dossier</div>
          <div className="mt-6 flex items-center gap-5">
            <Avatar size="lg">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={identity ?? address} /> : null}
              <AvatarFallback className="font-mono text-sm uppercase tracking-wider">
                {(identity ? identity.slice(0, 2) : address.slice(2, 4)).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="break-words text-4xl font-semibold leading-[0.95] tracking-tight md:text-5xl">
                {identityLoading ? (
                  <Skeleton className="h-10 w-64" />
                ) : identity ? (
                  identity
                ) : (
                  <span className="font-mono">{truncateAddress(address)}</span>
                )}
              </h1>
              <div className="mt-3 flex items-center gap-3">
                <code className="font-mono text-xs text-muted-foreground">
                  {truncateAddress(address)}
                </code>
                <a
                  href={`https://sepolia.etherscan.io/address/${address}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="View on Etherscan"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
        <PassportStrip
          address={address}
          status={status}
          subname={subname}
          ensName={ensName}
          member={member}
          balance={balance}
          balanceLoading={balanceLoading}
          nowSec={nowSec}
        />
      </header>

      <IdentityPanel name={subname ?? ensName ?? null} />

      <AuthoredSection address={address} />

      <ActivitySection address={address} />
    </main>
  )
}

type StatusKind = 'loading' | 'member' | 'former' | 'none'

function PassportStrip({
  address,
  status,
  subname,
  ensName,
  member,
  balance,
  balanceLoading,
  nowSec,
}: {
  address: Hex
  status: StatusKind
  subname: string | undefined
  ensName: string | undefined
  member: MemberKey | undefined
  balance: bigint | undefined
  balanceLoading: boolean
  nowSec: bigint
}) {
  const statusLabel =
    status === 'loading'
      ? 'Resolving…'
      : status === 'member'
        ? 'Member · Active'
        : status === 'former'
          ? 'Former member'
          : 'Not a member'

  const expires = member ? describeExpiry(member.expiration, nowSec) : null
  const balanceLabel =
    balance !== undefined
      ? formatToken(balance, tokens.base.ipe.decimals)
      : balanceLoading
        ? '…'
        : '—'

  const rows: Array<[string, React.ReactNode]> = [
    ['Address', <code key="a" className="font-mono">{truncateAddress(address)}</code>],
    ['Subname', subname ?? '—'],
    ['ENS', ensName ?? (subname ? '—' : '—')],
    ['Status', statusLabel],
    ['Joined', member ? `block ${member.createdAtBlock.toLocaleString()}` : '—'],
    ['Expires', expires ? expires.label : '—'],
    [`IPE · ${tokens.base.ipe.symbol}`, balanceLabel],
  ]

  return (
    <dl className="col-span-12 grid grid-cols-2 gap-x-8 gap-y-3 text-right md:col-span-5 md:justify-self-end">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {k}
          </dt>
          <dd className="truncate font-mono text-[12px] text-foreground/85">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function IdentityPanel({ name }: { name: string | null }) {
  const { data: records, isLoading } = useEnsTextRecords(name, TEXT_KEYS)
  const present = useMemo(() => {
    if (!records) return [] as Array<readonly [string, string]>
    return TEXT_KEYS.filter((k) => records[k] && records[k].length > 0).map(
      (k) => [k, records[k]] as const,
    )
  }, [records])

  if (!name) return null
  if (!isLoading && present.length === 0) return null

  return (
    <section className="border-b border-border py-12">
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
          §&nbsp;01&nbsp;&nbsp;Identity
        </h2>
        <span className={EYEBROW}>{name}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-16 w-full max-w-xl" />
      ) : (
        <dl className="grid gap-y-4 md:grid-cols-[10rem_1fr] md:gap-x-8">
          {present.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {prettyKey(k)}
              </dt>
              <dd className="font-serif text-[15px] leading-relaxed text-foreground/90 break-words">
                {isUrl(v) ? (
                  <a
                    href={v}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    {v}
                  </a>
                ) : (
                  v
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function AuthoredSection({ address }: { address: Hex }) {
  const { data: authored, isLoading } = useProposalsByAuthor(address)

  return (
    <section className="border-b border-border py-12">
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
          §&nbsp;02&nbsp;&nbsp;Motions authored
        </h2>
        <span className={EYEBROW}>
          {isLoading ? '…' : `${authored.length} ${authored.length === 1 ? 'motion' : 'motions'}`}
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : authored.length === 0 ? (
        <EmptyNote>
          No motions authored yet — when this member files one, it&rsquo;ll surface here.
        </EmptyNote>
      ) : (
        <ol className="border-t border-border">
          {authored.map((p) => (
            <AuthoredRow key={p.id.toString()} proposal={p} />
          ))}
        </ol>
      )}
    </section>
  )
}

function AuthoredRow({ proposal }: { proposal: AuthoredProposal }) {
  const { body, text, isLoading } = useProposalDescription(proposal.descriptionCid)
  const title = body?.headline ?? text ?? `Proposal #${proposal.id.toString()}`
  return (
    <li className="border-b border-border">
      <Link
        to="/proposals/$proposalId"
        params={{ proposalId: proposal.id.toString() }}
        className="grid grid-cols-[3.5rem_minmax(0,1fr)_8rem] items-baseline gap-4 py-5 transition-colors hover:bg-accent/40"
      >
        <span className="font-light tabular-nums text-muted-foreground text-2xl">
          {proposal.id.toString().padStart(2, '0')}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-serif text-[17px] text-foreground">
            {isLoading ? '…' : title}
          </span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            block {proposal.endBlock.toString()}
          </span>
        </span>
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {proposal.finalized ? 'Finalized' : 'Open'}
        </span>
      </Link>
    </li>
  )
}

function ActivitySection({ address }: { address: Hex }) {
  const { rows, isLoading } = useMemberActivity(address)
  const visible = useMemo(
    () =>
      rows.filter(
        (r) => r.delegatedTo || r.delegatorsIn.length > 0 || r.votedDirectly || r.countedBy,
      ),
    [rows],
  )

  return (
    <section className="py-12">
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
          §&nbsp;03&nbsp;&nbsp;Voting &amp; delegation
        </h2>
        <span className={EYEBROW}>
          {isLoading ? '…' : `${visible.length} active`}
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : visible.length === 0 ? (
        <EmptyNote>
          No activity recorded yet — votes, delegations and inbound delegators will appear here.
        </EmptyNote>
      ) : (
        <ul className="border-t border-border">
          {visible.map((r) => (
            <ActivityRow key={r.proposalId.toString()} row={r} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ActivityRow({ row }: { row: MemberActivityRow }) {
  const tags: Array<{ label: string; tone: 'on' | 'off' }> = []
  if (row.votedDirectly) tags.push({ label: 'Voted directly', tone: 'on' })
  if (row.delegatedTo)
    tags.push({
      label: `Delegated → ${truncateAddress(row.delegatedTo)}`,
      tone: 'off',
    })
  if (row.countedBy && !row.votedDirectly)
    tags.push({
      label: `Counted by ${truncateAddress(row.countedBy)}`,
      tone: 'off',
    })
  if (row.delegatorsIn.length > 0)
    tags.push({
      label: `${row.delegatorsIn.length} inbound delegator${row.delegatorsIn.length === 1 ? '' : 's'}`,
      tone: 'on',
    })

  return (
    <li className="border-b border-border">
      <Link
        to="/proposals/$proposalId"
        params={{ proposalId: row.proposalId.toString() }}
        className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-4 py-5 transition-colors hover:bg-accent/40"
      >
        <span className="font-light tabular-nums text-muted-foreground text-2xl">
          {row.proposalId.toString().padStart(2, '0')}
        </span>
        <span className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t.label}
              className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${
                t.tone === 'on'
                  ? 'border-foreground/80 text-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {t.label}
            </span>
          ))}
        </span>
      </Link>
    </li>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-dashed border-border px-5 py-6 font-serif text-[15px] italic text-muted-foreground">
      {children}
    </p>
  )
}

function describeExpiry(
  expiration: bigint,
  nowSec: bigint,
): { label: string; soon: boolean } {
  if (expiration >= NEVER_THRESHOLD) return { label: 'Never', soon: false }
  if (expiration <= nowSec) {
    return {
      label: `expired ${formatRelative(nowSec - expiration, 'ago')}`,
      soon: false,
    }
  }
  const delta = expiration - nowSec
  const soon = delta < 60n * 60n * 24n * 30n
  return { label: formatRelative(delta, 'left'), soon }
}

function formatRelative(deltaSec: bigint, suffix: 'ago' | 'left'): string {
  const day = 60n * 60n * 24n
  if (deltaSec < day) {
    const hours = Number(deltaSec / 3600n)
    return `${hours}h ${suffix}`
  }
  const days = deltaSec / day
  if (days < 60n) return `${days.toString()}d ${suffix}`
  const months = days / 30n
  if (months < 24n) return `${months.toString()}mo ${suffix}`
  const years = days / 365n
  return `${years.toString()}y ${suffix}`
}

function formatToken(amount: bigint, decimals: number): string {
  const v = Number(formatUnits(amount, decimals))
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function prettyKey(k: string): string {
  switch (k) {
    case 'com.twitter':
      return 'Twitter'
    case 'com.github':
      return 'GitHub'
    case 'url':
      return 'URL'
    case 'email':
      return 'Email'
    case 'description':
      return 'Bio'
    default:
      return k
  }
}

function isUrl(v: string): boolean {
  return /^https?:\/\//i.test(v)
}

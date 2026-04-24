import { createFileRoute, Link } from '@tanstack/react-router'
import type { Hex } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { UnlockConfidentialGovernorLiquidABI, addresses } from '@ipe-gov/sdk'
import { useProposal } from '../hooks/useProposal'
import { useProposalDescription } from '../hooks/useProposalDescription'
import { formatCountdown, useBlockCountdown } from '../hooks/useBlockCountdown'
import RequireUnlockMembership from '#/components/RequireUnlockMembership'

export const Route = createFileRoute('/proposals/')({
  head: () => ({ meta: [{ title: 'Proposals — ipe-gov' }] }),
  component: ProposalsGuarded,
})

function ProposalsGuarded() {
  return (
    <RequireUnlockMembership>
      <Proposals />
    </RequireUnlockMembership>
  )
}

function Proposals() {
  const { isConnected } = useAccount()
  const { data: count } = useReadContract({
    address: addresses.sepolia.governorLiquid as Hex,
    abi: UnlockConfidentialGovernorLiquidABI,
    functionName: 'proposalCount',
  })
  const total = count ? Number(count) : 0
  const ids = Array.from({ length: total }, (_, i) => total - i)

  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-12">
      <header className="mb-10 flex items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            The Register · Sepolia
          </div>
          <h1 className="text-5xl font-semibold tracking-tight">Proposals</h1>
        </div>
        <div className="pb-2 text-right font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {total} {total === 1 ? 'motion' : 'motions'}
        </div>
      </header>

      {isConnected ? (
        <Link
          to="/proposals/new"
          className="group flex items-center justify-between gap-4 border border-dashed border-border px-5 py-4 transition-colors hover:border-foreground/60 hover:bg-accent/40"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors group-hover:text-foreground">
            Draft a new motion
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/70 transition-colors group-hover:text-foreground">
            Open drafting chamber →
          </span>
        </Link>
      ) : null}

      <section className="mt-10">
        {ids.length === 0 ? (
          <div className="border-t border-border py-20 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            No proposals yet
          </div>
        ) : (
          <ul className="border-t border-border">
            {ids.map((id) => (
              <ProposalRow key={id} id={id} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function ProposalRow({ id }: { id: number }) {
  const proposal = useProposal(BigInt(id))
  const { text } = useProposalDescription(proposal.descriptionCid)
  const title =
    text ??
    (proposal.descriptionCid ? 'Loading description…' : `Proposal #${id}`)

  const status: StatusTone = proposal.finalized
    ? 'finalized'
    : proposal.votingClosed
      ? 'closed-pending'
      : 'open'

  const remaining = useBlockCountdown(
    status === 'open' ? proposal.endBlock : undefined,
  )

  return (
    <li className="border-b border-border">
      <Link
        to="/proposals/$proposalId"
        params={{ proposalId: String(id) }}
        className="grid grid-cols-[4rem_1fr_auto] items-center gap-6 px-2 py-6 transition-colors hover:bg-accent/60"
      >
        <span className="self-start pt-1 text-4xl font-light leading-none tabular-nums text-muted-foreground">
          {String(id).padStart(2, '0')}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-medium text-foreground">
            {title}
          </span>
          {proposal.endBlock !== undefined ? (
            <span className="mt-1.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {status === 'open' && remaining !== null ? (
                <span className="text-foreground/90">
                  closes in {formatCountdown(remaining)}
                </span>
              ) : (
                <>closed at block {proposal.endBlock.toString()}</>
              )}
            </span>
          ) : null}
        </span>
        <StatusChip tone={status} />
      </Link>
    </li>
  )
}

type StatusTone = 'open' | 'closed-pending' | 'closed-counted' | 'finalized'

function StatusChip({ tone }: { tone: StatusTone }) {
  const label =
    tone === 'open'
      ? 'Voting open'
      : tone === 'closed-pending'
        ? 'Awaiting finalize'
        : tone === 'closed-counted'
          ? 'Counted'
          : 'Finalized'
  // Tone varies by border weight and text opacity — no new color tokens.
  const chrome =
    tone === 'open'
      ? 'border-foreground/80 text-foreground'
      : tone === 'finalized'
        ? 'border-border bg-secondary/60 text-muted-foreground'
        : 'border-foreground/30 text-foreground/75'
  return (
    <span
      className={`inline-flex select-none items-center whitespace-nowrap border ${chrome} px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]`}
    >
      {label}
    </span>
  )
}


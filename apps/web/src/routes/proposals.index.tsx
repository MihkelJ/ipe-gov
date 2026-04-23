import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAccount, useReadContract, useSignMessage } from 'wagmi'
import { GOVERNOR_ABI, GOVERNOR_ADDRESS } from '../lib/governor'
import { useSponsoredWrite } from '../hooks/useSponsoredWrite'
import { useProposal } from '../hooks/useProposal'
import { useProposalDescription } from '../hooks/useProposalDescription'
import { formatCountdown, useBlockCountdown } from '../hooks/useBlockCountdown'
import { buildPinMessage, pinDescription } from '../lib/pinApi'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/proposals/')({
  head: () => ({ meta: [{ title: 'Proposals — ipe-gov' }] }),
  component: Proposals,
})

function Proposals() {
  const { isConnected } = useAccount()
  const { data: count, refetch: refetchCount } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: GOVERNOR_ABI,
    functionName: 'proposalCount',
  })
  const total = count ? Number(count) : 0
  const ids = Array.from({ length: total }, (_, i) => total - i)

  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-12">
      <header className="mb-12 flex items-end justify-between gap-6 border-b border-border pb-6">
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

      {isConnected ? <NewProposalForm onProposed={refetchCount} /> : null}

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

function NewProposalForm({ onProposed }: { onProposed: () => Promise<unknown> }) {
  const { address } = useAccount()
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const { signMessageAsync } = useSignMessage()
  const { mutateAsync: sponsoredWrite } = useSponsoredWrite()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!address || !text.trim()) return
    setBusy(true)
    try {
      setStatus('Requesting signature…')
      const message = buildPinMessage(address, Date.now())
      const signature = await signMessageAsync({ message })

      setStatus('Pinning to IPFS…')
      const { cid } = await pinDescription({
        data: { text: text.trim(), address, signature, message },
      })

      setStatus('Submitting on-chain proposal…')
      await sponsoredWrite({
        address: GOVERNOR_ADDRESS,
        abi: GOVERNOR_ABI,
        functionName: 'propose',
        args: [cid],
      })
      setStatus('Proposal submitted.')
      setText('')
      // Refetch proposalCount up the tree so the new motion appears in the
      // register without a manual reload.
      await onProposed()
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-2 border border-border bg-secondary/30 px-6 py-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          New motion
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Pinned to IPFS · CID stored on-chain
        </span>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input
          placeholder="What should the DAO decide?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          className="h-11 text-base"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {status}
          </span>
          <Button type="submit" disabled={busy || !text.trim()}>
            {busy ? 'Submitting…' : 'Propose'}
          </Button>
        </div>
      </form>
    </section>
  )
}

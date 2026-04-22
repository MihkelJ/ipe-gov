import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  useAccount,
  useReadContract,
  useSignMessage,
  useWriteContract,
} from 'wagmi'
import { GOVERNOR_ABI, GOVERNOR_ADDRESS } from '../lib/governor'
import { useProposal } from '../lib/useProposal'
import { useProposalDescription } from '../lib/useProposalDescription'
import { buildPinMessage, pinDescription } from '../server/pinDescription'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'

export const Route = createFileRoute('/proposals/')({
  head: () => ({ meta: [{ title: 'Proposals — ipe-gov' }] }),
  component: Proposals,
})

function Proposals() {
  const { isConnected } = useAccount()
  const { data: count } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: GOVERNOR_ABI,
    functionName: 'proposalCount',
  })
  const total = count ? Number(count) : 0
  const ids = Array.from({ length: total }, (_, i) => total - i)

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Proposals</h1>

      {isConnected ? <NewProposalCard /> : null}

      <section className="mt-8 space-y-3">
        {ids.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No proposals yet.
            </CardContent>
          </Card>
        ) : (
          ids.map((id) => <ProposalRow key={id} id={id} />)
        )}
      </section>
    </main>
  )
}

function ProposalRow({ id }: { id: number }) {
  const proposal = useProposal(BigInt(id))
  const { text } = useProposalDescription(proposal.descriptionCid)
  const title = text ?? (proposal.descriptionCid ? 'Loading description…' : `Proposal #${id}`)
  const subtitle = proposal.finalized
    ? 'Finalized'
    : proposal.votingClosed
      ? 'Voting closed — awaiting finalization'
      : 'Voting open'

  return (
    <Link to="/proposals/$proposalId" params={{ proposalId: String(id) }} className="block">
      <Card className="transition hover:border-primary/50 hover:bg-accent/40">
        <CardHeader>
          <CardTitle className="flex items-baseline gap-3">
            <span className="text-xs font-mono text-muted-foreground">#{id}</span>
            <span className="truncate">{title}</span>
          </CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  )
}

function NewProposalCard() {
  const { address } = useAccount()
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync } = useWriteContract()

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
      await writeContractAsync({
        address: GOVERNOR_ADDRESS,
        abi: GOVERNOR_ABI,
        functionName: 'propose',
        args: [cid],
      })
      setStatus('Proposal submitted.')
      setText('')
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New proposal</CardTitle>
        <CardDescription>
          Only holders of a valid Unlock Protocol key can propose. Your description
          is pinned to IPFS; the contract only stores the CID.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            placeholder="What should the DAO decide?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{status}</span>
            <Button type="submit" disabled={busy || !text.trim()}>
              {busy ? 'Submitting…' : 'Propose'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

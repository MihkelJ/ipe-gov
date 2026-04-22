import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useReadContract } from 'wagmi'
import { encryptVote, publicDecryptHandles } from '../lib/fhevm'
import { GOVERNOR_ABI, GOVERNOR_ADDRESS } from '../lib/governor'
import { useSponsoredWrite } from '../hooks/useSponsoredWrite'
import { useProposal, type ProposalHandles } from '../lib/useProposal'
import { useProposalDescription } from '../lib/useProposalDescription'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'

export const Route = createFileRoute('/proposals/$proposalId')({
  head: ({ params }) => ({
    meta: [{ title: `Proposal #${params.proposalId} — ipe-gov` }],
  }),
  component: ProposalPage,
})

function ProposalPage() {
  const { proposalId } = Route.useParams()
  const id = BigInt(proposalId)
  const proposal = useProposal(id)
  const { text: description, isLoading: descLoading } = useProposalDescription(
    proposal.descriptionCid,
  )
  const [status, setStatus] = useState<string>('')

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10">
      <Button asChild variant="ghost" size="sm" className="mb-6">
        <Link to="/proposals">← All proposals</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {description
              ? description
              : descLoading
                ? 'Loading description…'
                : `Proposal #${proposalId}`}
          </CardTitle>
          <CardDescription>
            <span className="mr-2 text-xs uppercase tracking-wider">
              #{proposalId}
            </span>
            <ProposalStatusLine
              finalized={proposal.finalized}
              votingClosed={proposal.votingClosed}
              endBlock={proposal.endBlock}
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalActions
            id={id}
            proposal={proposal}
            onStatusChange={setStatus}
          />
        </CardContent>
        {status ? (
          <CardFooter>
            <p className="text-sm text-muted-foreground">{status}</p>
          </CardFooter>
        ) : null}
      </Card>
    </main>
  )
}

function ProposalStatusLine({
  finalized,
  votingClosed,
  endBlock,
}: {
  finalized: boolean
  votingClosed: boolean
  endBlock?: bigint
}) {
  const label = finalized
    ? 'finalized'
    : votingClosed
      ? 'voting closed — awaiting finalization'
      : 'voting open'

  return (
    <>
      Status: {label}
      {endBlock !== undefined && !finalized
        ? ` · voting ends at block ${endBlock.toString()}`
        : null}
    </>
  )
}

type ActionsProps = {
  id: bigint
  proposal: ReturnType<typeof useProposal>
  onStatusChange: (s: string) => void
}

function ProposalActions({ id, proposal, onStatusChange }: ActionsProps) {
  const { isConnected } = useAccount()

  if (proposal.isLoading || !proposal.handles) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (!isConnected) {
    return (
      <p className="text-sm text-muted-foreground">Connect a wallet to vote.</p>
    )
  }
  if (proposal.finalized) {
    return <Tallies handles={proposal.handles} />
  }
  if (proposal.votingClosed) {
    return (
      <FinalizeAction
        id={id}
        onStatusChange={onStatusChange}
        onDone={proposal.refetch}
      />
    )
  }
  return (
    <VoteAction id={id} onStatusChange={onStatusChange} onDone={proposal.refetch} />
  )
}

function FinalizeAction({
  id,
  onStatusChange,
  onDone,
}: {
  id: bigint
  onStatusChange: (s: string) => void
  onDone: () => Promise<unknown>
}) {
  const { mutateAsync: sponsoredWrite, isPending } = useSponsoredWrite()

  async function finalize() {
    onStatusChange('Submitting finalize transaction…')
    try {
      await sponsoredWrite({
        address: GOVERNOR_ADDRESS,
        abi: GOVERNOR_ABI,
        functionName: 'finalize',
        args: [id],
      })
      onStatusChange('Proposal finalized.')
      await onDone()
    } catch (err) {
      onStatusChange(`Error: ${(err as Error).message}`)
    }
  }

  return (
    <Button onClick={finalize} disabled={isPending}>
      Finalize proposal
    </Button>
  )
}

function VoteAction({
  id,
  onStatusChange,
  onDone,
}: {
  id: bigint
  onStatusChange: (s: string) => void
  onDone: () => Promise<unknown>
}) {
  const { address } = useAccount()
  const { mutateAsync: sponsoredWrite, isPending } = useSponsoredWrite()
  const { data: alreadyVoted } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: GOVERNOR_ABI,
    functionName: 'hasVoted',
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  })

  if (alreadyVoted) {
    return (
      <p className="text-sm text-muted-foreground">
        You have already voted on this proposal.
      </p>
    )
  }

  async function cast(support: 0 | 1 | 2) {
    if (!address) return
    onStatusChange('Encrypting vote…')
    try {
      const { handle, inputProof } = await encryptVote(
        GOVERNOR_ADDRESS,
        address,
        support,
      )
      onStatusChange('Submitting transaction…')
      await sponsoredWrite({
        address: GOVERNOR_ADDRESS,
        abi: GOVERNOR_ABI,
        functionName: 'castVote',
        args: [id, handle, inputProof],
      })
      onStatusChange('Vote submitted.')
      await onDone()
    } catch (err) {
      onStatusChange(`Error: ${(err as Error).message}`)
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => cast(1)} disabled={isPending}>
        For
      </Button>
      <Button onClick={() => cast(0)} disabled={isPending} variant="outline">
        Against
      </Button>
      <Button onClick={() => cast(2)} disabled={isPending} variant="ghost">
        Abstain
      </Button>
    </div>
  )
}

function Tallies({ handles }: { handles: ProposalHandles }) {
  const {
    data: values,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tallies', handles.forVotes, handles.againstVotes, handles.abstainVotes],
    queryFn: () =>
      publicDecryptHandles([
        handles.forVotes,
        handles.againstVotes,
        handles.abstainVotes,
      ]),
    staleTime: Infinity,
  })

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Decrypting tallies…</p>
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to decrypt tallies: {(error as Error).message}
      </p>
    )
  }
  if (!values) return null

  const [forVotes, againstVotes, abstainVotes] = values
  const rows = [
    { label: 'For', value: forVotes },
    { label: 'Against', value: againstVotes },
    { label: 'Abstain', value: abstainVotes },
  ] as const

  return (
    <div className="grid grid-cols-3 gap-4">
      {rows.map((r) => (
        <div key={r.label} className="rounded-lg border bg-card p-4 text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {r.label}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {r.value.toString()}
          </div>
        </div>
      ))}
    </div>
  )
}

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useAccount,
  useBlockNumber,
  useReadContract,
  useWriteContract,
} from 'wagmi'
import { UnlockConfidentialGovernorABI, addresses } from '@ipe-gov/sdk'
import { encryptVote, publicDecryptHandles } from '../lib/fhevm'
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

const GOVERNOR = addresses.sepolia.governor as `0x${string}`

type ProposalTuple = readonly [
  proposer: `0x${string}`,
  startBlock: bigint,
  endBlock: bigint,
  forVotes: `0x${string}`,
  againstVotes: `0x${string}`,
  abstainVotes: `0x${string}`,
  finalized: boolean,
]

function ProposalPage() {
  const { proposalId } = Route.useParams()
  const id = BigInt(proposalId)
  const { address, isConnected } = useAccount()

  const { data: proposal, refetch: refetchProposal } = useReadContract({
    address: GOVERNOR,
    abi: UnlockConfidentialGovernorABI,
    functionName: 'getProposal',
    args: [id],
  })

  const { data: alreadyVoted, refetch: refetchHasVoted } = useReadContract({
    address: GOVERNOR,
    abi: UnlockConfidentialGovernorABI,
    functionName: 'hasVoted',
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const { data: currentBlock } = useBlockNumber({ watch: true })

  const p = proposal as ProposalTuple | undefined
  const endBlock = p?.[2]
  const finalized = p?.[6] ?? false
  const votingClosed =
    endBlock !== undefined && currentBlock !== undefined
      ? currentBlock > endBlock
      : false

  const { writeContractAsync, isPending: txPending } = useWriteContract()
  const [status, setStatus] = useState<string>('')

  async function vote(support: 0 | 1 | 2) {
    if (!address) return
    setStatus('Encrypting vote…')
    try {
      const { handle, inputProof } = await encryptVote(GOVERNOR, address, support)
      setStatus('Submitting transaction…')
      await writeContractAsync({
        address: GOVERNOR,
        abi: UnlockConfidentialGovernorABI,
        functionName: 'castVote',
        args: [id, handle, inputProof],
      })
      setStatus('Vote submitted.')
      await Promise.all([refetchProposal(), refetchHasVoted()])
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    }
  }

  async function finalize() {
    setStatus('Submitting finalize transaction…')
    try {
      await writeContractAsync({
        address: GOVERNOR,
        abi: UnlockConfidentialGovernorABI,
        functionName: 'finalize',
        args: [id],
      })
      setStatus('Proposal finalized.')
      await refetchProposal()
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10">
      <Button asChild variant="ghost" size="sm" className="mb-6">
        <Link to="/proposals">← All proposals</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Proposal #{proposalId}</CardTitle>
          <CardDescription>
            Status:{' '}
            {finalized
              ? 'finalized'
              : votingClosed
                ? 'voting closed — awaiting finalization'
                : 'voting open'}
            {endBlock !== undefined && !finalized
              ? ` · voting ends at block ${endBlock.toString()}`
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!p ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !isConnected ? (
            <p className="text-sm text-muted-foreground">
              Connect a wallet to vote.
            </p>
          ) : finalized ? (
            <Tallies proposalId={id} />
          ) : votingClosed ? (
            <Button onClick={finalize} disabled={txPending}>
              Finalize proposal
            </Button>
          ) : alreadyVoted ? (
            <p className="text-sm text-muted-foreground">
              You have already voted on this proposal.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => vote(1)} disabled={txPending}>
                For
              </Button>
              <Button
                onClick={() => vote(0)}
                disabled={txPending}
                variant="outline"
              >
                Against
              </Button>
              <Button
                onClick={() => vote(2)}
                disabled={txPending}
                variant="ghost"
              >
                Abstain
              </Button>
            </div>
          )}
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

function Tallies({ proposalId }: { proposalId: bigint }) {
  const { data: proposal } = useReadContract({
    address: GOVERNOR,
    abi: UnlockConfidentialGovernorABI,
    functionName: 'getProposal',
    args: [proposalId],
  })
  const p = proposal as ProposalTuple | undefined
  const handles = p
    ? ([p[3], p[4], p[5]] as [`0x${string}`, `0x${string}`, `0x${string}`])
    : undefined

  const {
    data: values,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tallies', proposalId.toString(), handles],
    queryFn: () => publicDecryptHandles(handles!),
    enabled: Boolean(handles),
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
  ]

  return (
    <div className="grid grid-cols-3 gap-4">
      {rows.map((r) => (
        <div
          key={r.label}
          className="rounded-lg border bg-card p-4 text-center"
        >
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

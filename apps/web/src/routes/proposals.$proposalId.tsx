import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { UnlockConfidentialGovernorABI, addresses } from '@ipe-gov/sdk'
import { encryptVote } from '../lib/fhevm'
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
  component: ProposalPage,
})

const GOVERNOR = addresses.sepolia.governor as `0x${string}`

function ProposalPage() {
  const { proposalId } = Route.useParams()
  const id = BigInt(proposalId)
  const { address, isConnected } = useAccount()

  const { data: proposal } = useReadContract({
    address: GOVERNOR,
    abi: UnlockConfidentialGovernorABI,
    functionName: 'getProposal',
    args: [id],
  })

  const { data: alreadyVoted } = useReadContract({
    address: GOVERNOR,
    abi: UnlockConfidentialGovernorABI,
    functionName: 'hasVoted',
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const { writeContractAsync, isPending } = useWriteContract()
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
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    }
  }

  const finalized = proposal ? (proposal as readonly unknown[])[6] === true : false

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10">
      <div className="mb-8 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/proposals">← All proposals</Link>
        </Button>
        <ConnectButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Proposal #{proposalId}</CardTitle>
          <CardDescription>
            Status: {finalized ? 'finalized' : 'voting open'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!proposal ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !isConnected ? (
            <p className="text-sm text-muted-foreground">
              Connect a wallet to vote.
            </p>
          ) : alreadyVoted ? (
            <p className="text-sm text-muted-foreground">
              You have already voted on this proposal.
            </p>
          ) : finalized ? (
            <p className="text-sm text-muted-foreground">Voting is closed.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => vote(1)} disabled={isPending}>
                For
              </Button>
              <Button
                onClick={() => vote(0)}
                disabled={isPending}
                variant="outline"
              >
                Against
              </Button>
              <Button
                onClick={() => vote(2)}
                disabled={isPending}
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

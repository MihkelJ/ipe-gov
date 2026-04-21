import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { UnlockConfidentialGovernorABI, addresses } from '@ipe-gov/sdk'
import { encryptVote } from '../lib/fhevm'

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
    <main className="page-wrap px-4 pb-8 pt-14">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/proposals" className="text-[var(--lagoon-deep)] underline">
          ← All proposals
        </Link>
        <ConnectButton />
      </div>

      <h1 className="mb-4 text-3xl font-bold">Proposal #{proposalId}</h1>

      {!proposal ? (
        <p>Loading…</p>
      ) : (
        <>
          <p className="text-sm text-[var(--sea-ink-soft)]">
            Finalized: {finalized ? 'yes' : 'no'}
          </p>

          {!isConnected ? (
            <p className="mt-6">Connect a wallet to vote.</p>
          ) : alreadyVoted ? (
            <p className="mt-6 text-[var(--sea-ink-soft)]">You have already voted.</p>
          ) : finalized ? (
            <p className="mt-6 text-[var(--sea-ink-soft)]">Voting is closed.</p>
          ) : (
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => vote(1)}
                disabled={isPending}
                className="rounded-xl bg-[var(--lagoon-deep)] px-5 py-2 font-semibold text-white disabled:opacity-60"
              >
                For
              </button>
              <button
                onClick={() => vote(0)}
                disabled={isPending}
                className="rounded-xl border border-[rgba(23,58,64,0.2)] px-5 py-2 font-semibold disabled:opacity-60"
              >
                Against
              </button>
              <button
                onClick={() => vote(2)}
                disabled={isPending}
                className="rounded-xl border border-[rgba(23,58,64,0.2)] px-5 py-2 font-semibold disabled:opacity-60"
              >
                Abstain
              </button>
            </div>
          )}

          {status ? <p className="mt-4 text-sm">{status}</p> : null}
        </>
      )}
    </main>
  )
}

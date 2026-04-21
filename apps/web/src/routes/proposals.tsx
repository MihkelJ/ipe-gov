import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { UnlockConfidentialGovernorABI, addresses } from '@ipe-gov/sdk'

export const Route = createFileRoute('/proposals')({ component: Proposals })

const GOVERNOR = addresses.sepolia.governor as `0x${string}`

function Proposals() {
  const { isConnected } = useAccount()
  const { data: count } = useReadContract({
    address: GOVERNOR,
    abi: UnlockConfidentialGovernorABI,
    functionName: 'proposalCount',
  })
  const total = count ? Number(count as bigint) : 0
  const ids = Array.from({ length: total }, (_, i) => total - i)

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Proposals</h1>
        <ConnectButton />
      </div>

      {isConnected ? <NewProposalForm /> : null}

      <ul className="mt-8 space-y-2">
        {ids.length === 0 ? (
          <p className="text-[var(--sea-ink-soft)]">No proposals yet.</p>
        ) : (
          ids.map((id) => (
            <li key={id}>
              <Link
                to="/proposals/$proposalId"
                params={{ proposalId: String(id) }}
                className="block rounded-xl border border-[rgba(23,58,64,0.1)] p-4 hover:bg-[rgba(79,184,178,0.08)]"
              >
                Proposal #{id}
              </Link>
            </li>
          ))
        )}
      </ul>
    </main>
  )
}

function NewProposalForm() {
  const [description, setDescription] = useState('')
  const { writeContract, isPending } = useWriteContract()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    writeContract({
      address: GOVERNOR,
      abi: UnlockConfidentialGovernorABI,
      functionName: 'propose',
      args: [description],
    })
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        className="flex-1 rounded-xl border border-[rgba(23,58,64,0.2)] px-4 py-2"
        placeholder="Proposal description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-[var(--lagoon-deep)] px-5 py-2 font-semibold text-white disabled:opacity-60"
      >
        {isPending ? 'Submitting…' : 'Propose'}
      </button>
    </form>
  )
}

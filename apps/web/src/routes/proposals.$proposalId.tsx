import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isAddress, zeroAddress, type Hex } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { encryptVote, publicDecryptHandles } from '../lib/fhevm'
import { GOVERNOR_ABI, GOVERNOR_ADDRESS } from '../lib/governor'
import { DELEGATION_ABI, DELEGATION_ADDRESS } from '../lib/delegation'
import {
  DELEGATE_BATCH_SIZE,
  useClaimableDelegators,
  useDelegationTargetCheck,
  useIsMember,
  useMyDelegate,
  type DelegationTargetReason,
} from '../lib/useDelegation'
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
  const { isConnected, address } = useAccount()
  const { data: isMember, isLoading: memberLoading } = useIsMember(address)

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
  if (memberLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Checking membership status…
      </p>
    )
  }
  if (!isMember) {
    return (
      <p className="text-sm text-muted-foreground">
        You need a valid Unlock membership key to act on this proposal.
      </p>
    )
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
  const { data: alreadyDirectlyVoted, refetch: refetchVoted } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: GOVERNOR_ABI,
    functionName: 'hasDirectlyVoted',
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  })
  const { data: countedByAddr, refetch: refetchCountedBy } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: GOVERNOR_ABI,
    functionName: 'countedBy',
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  })
  const { data: myDelegate, refetch: refetchMyDelegate } = useMyDelegate(id, address)
  const claim = useClaimableDelegators(id, address)
  const [justClaimedAsDelegate, setJustClaimedAsDelegate] = useState(false)

  async function refresh() {
    await Promise.all([
      refetchVoted(),
      refetchCountedBy(),
      refetchMyDelegate(),
      claim.refetch(),
      onDone(),
    ])
  }

  const hasDelegate = myDelegate && myDelegate !== zeroAddress
  const hasClaimable = claim.claimable.length > 0
  const hasExcluded = claim.excluded.length > 0
  const overflow = claim.claimable.length > DELEGATE_BATCH_SIZE
  const countedByDelegate = countedByAddr && countedByAddr !== zeroAddress

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
      await refresh()
    } catch (err) {
      onStatusChange(`Error: ${(err as Error).message}`)
    }
  }

  async function castAsDelegate(support: 0 | 1 | 2) {
    if (!address || !hasClaimable) return
    // Slice to the contract's MAX_DELEGATORS_PER_CALL. If there are more
    // claimable delegators than fit in one call, the UI surfaces "run again"
    // via the `overflow` banner below.
    const batch = claim.claimable.slice(0, DELEGATE_BATCH_SIZE) as readonly Hex[]
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
        functionName: 'castVoteAsDelegate',
        args: [id, handle, inputProof, batch],
      })
      onStatusChange(
        `Claimed ${batch.length} delegator${batch.length === 1 ? '' : 's'}.`,
      )
      setJustClaimedAsDelegate(true)
      await refresh()
    } catch (err) {
      onStatusChange(`Error: ${(err as Error).message}`)
    }
  }

  return (
    <div className="space-y-6">
      <DelegateSection
        id={id}
        currentDelegate={hasDelegate ? myDelegate : undefined}
        onStatusChange={onStatusChange}
        onDone={refresh}
      />

      {justClaimedAsDelegate && !alreadyDirectlyVoted ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          Reminder: you claimed delegator votes but haven&rsquo;t cast your own
          yet. Use the buttons below to record your own choice.
        </div>
      ) : null}

      {alreadyDirectlyVoted ? (
        <p className="text-sm text-muted-foreground">
          You have already voted directly on this proposal.
        </p>
      ) : (
        <div className="space-y-3">
          {countedByDelegate ? (
            <p className="rounded-md border bg-muted/40 p-3 text-sm">
              Your vote was already cast by{' '}
              <code className="text-xs">{short(countedByAddr!)}</code>.
              Casting below overrides that.
            </p>
          ) : hasDelegate ? (
            <p className="rounded-md border bg-muted/40 p-3 text-sm">
              You&rsquo;re currently delegating to{' '}
              <code className="text-xs">{short(myDelegate!)}</code>. Casting
              below overrides that delegation.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => cast(1)} disabled={isPending}>
              For
            </Button>
            <Button
              onClick={() => cast(0)}
              disabled={isPending}
              variant="outline"
            >
              Against
            </Button>
            <Button onClick={() => cast(2)} disabled={isPending} variant="ghost">
              Abstain
            </Button>
          </div>
        </div>
      )}

      {hasClaimable || hasExcluded ? (
        <div className="space-y-3 rounded-md border p-4">
          <div>
            <div className="text-sm font-medium">
              You hold delegated voting power
            </div>
            <div className="text-xs text-muted-foreground">
              <DelegatorClaimDescription
                claimableCount={claim.claimable.length}
                excludedCount={claim.excluded.length}
                overflow={overflow}
              />{' '}
              Cast your own vote separately via the buttons above.
            </div>
          </div>
          {hasClaimable ? (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => castAsDelegate(1)} disabled={isPending}>
                Claim as For
              </Button>
              <Button
                onClick={() => castAsDelegate(0)}
                disabled={isPending}
                variant="outline"
              >
                Claim as Against
              </Button>
              <Button
                onClick={() => castAsDelegate(2)}
                disabled={isPending}
                variant="ghost"
              >
                Claim as Abstain
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function DelegatorClaimDescription({
  claimableCount,
  excludedCount,
  overflow,
}: {
  claimableCount: number
  excludedCount: number
  overflow: boolean
}) {
  if (claimableCount === 0 && excludedCount > 0) {
    return (
      <>
        All {excludedCount} of your delegator
        {excludedCount === 1 ? ' has' : 's have'} already voted directly —
        nothing to claim.
      </>
    )
  }
  const claimLine = overflow
    ? `${DELEGATE_BATCH_SIZE} of ${claimableCount} delegators will be claimed in this batch — re-run after it lands to claim the rest.`
    : `${claimableCount} delegator${claimableCount === 1 ? '' : 's'} ready to claim.`
  const excludedLine =
    excludedCount > 0
      ? ` ${excludedCount} already voted directly and won't be included.`
      : ''
  return (
    <>
      {claimLine}
      {excludedLine}
    </>
  )
}

function DelegateSection({
  id,
  currentDelegate,
  onStatusChange,
  onDone,
}: {
  id: bigint
  currentDelegate?: Hex
  onStatusChange: (s: string) => void
  onDone: () => Promise<unknown>
}) {
  const { address } = useAccount()
  const [addr, setAddr] = useState('')
  const { mutateAsync: sponsoredWrite, isPending } = useSponsoredWrite()

  const normalized = isAddress(addr) ? (addr as Hex) : undefined
  const check = useDelegationTargetCheck(id, address, normalized)
  const targetError = describeDelegationReason(check.reason)

  async function doDelegate() {
    if (!normalized) {
      onStatusChange('Invalid address.')
      return
    }
    if (!check.ok) {
      onStatusChange(targetError ?? 'Cannot delegate to that address.')
      return
    }
    onStatusChange('Submitting delegation…')
    try {
      await sponsoredWrite({
        address: DELEGATION_ADDRESS,
        abi: DELEGATION_ABI,
        functionName: 'delegate',
        args: [id, normalized],
      })
      onStatusChange('Delegation set.')
      setAddr('')
      await onDone()
    } catch (err) {
      onStatusChange(`Error: ${(err as Error).message}`)
    }
  }

  async function doUndelegate() {
    onStatusChange('Revoking delegation…')
    try {
      await sponsoredWrite({
        address: DELEGATION_ADDRESS,
        abi: DELEGATION_ABI,
        functionName: 'undelegate',
        args: [id],
      })
      onStatusChange('Delegation revoked.')
      await onDone()
    } catch (err) {
      onStatusChange(`Error: ${(err as Error).message}`)
    }
  }

  if (currentDelegate) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border p-4">
        <div className="text-sm">
          Delegating to <code className="text-xs">{short(currentDelegate)}</code>
        </div>
        <Button variant="outline" size="sm" onClick={doUndelegate} disabled={isPending}>
          Revoke
        </Button>
      </div>
    )
  }

  const checking = Boolean(normalized) && check.isLoading
  const buttonDisabled = isPending || !normalized || checking || !check.ok

  return (
    <div className="space-y-2 rounded-md border p-4">
      <div className="text-sm font-medium">Delegate your vote on this proposal</div>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="0x…"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          className="flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm"
          spellCheck={false}
        />
        <Button onClick={doDelegate} disabled={buttonDisabled}>
          Delegate
        </Button>
      </div>
      {addr && !normalized ? (
        <p className="text-xs text-destructive">Not a valid 0x address.</p>
      ) : checking ? (
        <p className="text-xs text-muted-foreground">Checking target…</p>
      ) : targetError ? (
        <p className="text-xs text-destructive">{targetError}</p>
      ) : null}
    </div>
  )
}

function describeDelegationReason(
  reason: DelegationTargetReason | undefined,
): string | null {
  switch (reason) {
    case 'self':
      return 'Cannot delegate to yourself.'
    case 'non-member':
      return 'Target does not hold an Unlock membership key.'
    case 'cycle':
      return 'That would create a delegation cycle on this proposal.'
    case 'too-deep':
      return 'Delegation chain would exceed the maximum depth.'
    default:
      return null
  }
}

function short(addr: Hex) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
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

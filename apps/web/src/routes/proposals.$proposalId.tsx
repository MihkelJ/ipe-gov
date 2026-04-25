import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isAddress, zeroAddress, type Address, type Hex } from 'viem'
import type { ProposalBody } from '@ipe-gov/ipfs'
import { useClaimedSubnames, useIdentity } from '#/hooks/useIdentity'
import { useAccount, useReadContract } from 'wagmi'
import {
  LiquidDelegationABI,
  UnlockConfidentialGovernorLiquidABI,
  addresses,
} from '@ipe-gov/sdk'
import { encryptVote, publicDecryptHandles } from '../lib/fhevm'
import {
  DELEGATE_BATCH_SIZE,
  useClaimableDelegators,
  useDelegationTargetCheck,
  useIsMember,
  useMyDelegate,
  type DelegationTargetReason,
} from '../hooks/useDelegation'
import { useAllMembers } from '../hooks/useMembers'
import { formatCountdown, useBlockCountdown } from '../hooks/useBlockCountdown'
import { useSponsoredWrite, type WriteParams } from '../hooks/useSponsoredWrite'
import { useProposal, type ProposalHandles } from '../hooks/useProposal'
import { useProposalDescription } from '../hooks/useProposalDescription'
import { truncateAddress } from '#/lib/address'
import RequireUnlockMembership from '#/components/RequireUnlockMembership'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/proposals/$proposalId')({
  head: ({ params }) => ({
    meta: [{ title: `Proposal #${params.proposalId} — ipe-gov` }],
  }),
  component: ProposalPageGuarded,
})

function ProposalPageGuarded() {
  return (
    <RequireUnlockMembership>
      <ProposalPage />
    </RequireUnlockMembership>
  )
}

function ProposalPage() {
  const { proposalId } = Route.useParams()
  const id = BigInt(proposalId)
  const proposal = useProposal(id)
  const {
    text: description,
    body,
    isLoading: descLoading,
  } = useProposalDescription(proposal.descriptionCid)
  const [status, setStatus] = useState<string>('')

  const title = body?.headline
    ? body.headline
    : description
      ? description
      : descLoading
        ? 'Loading description…'
        : `Proposal #${proposalId}`

  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-10">
      <div className="mb-10">
        <Link
          to="/proposals"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← All proposals
        </Link>
      </div>

      <header className="mb-10 grid grid-cols-[5.5rem_1fr] items-start gap-6 border-b border-border pb-8">
        <div className="font-light leading-none tabular-nums text-muted-foreground text-[5rem]">
          {String(proposalId).padStart(2, '0')}
        </div>
        <div className="min-w-0 space-y-4 pt-2">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight break-words">
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <DetailStatusChip
              finalized={proposal.finalized}
              votingClosed={proposal.votingClosed}
            />
            <BlockMeta
              endBlock={proposal.endBlock}
              finalized={proposal.finalized}
              votingClosed={proposal.votingClosed}
            />
          </div>
        </div>
      </header>

      {body ? <ProposalBrief body={body} /> : null}

      <ProposalActions id={id} proposal={proposal} onStatusChange={setStatus} />

      {status ? (
        <p
          role="status"
          className="mt-10 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
        >
          {status}
        </p>
      ) : null}
    </main>
  )
}

function DetailStatusChip({
  finalized,
  votingClosed,
}: {
  finalized: boolean
  votingClosed: boolean
}) {
  const { label, chrome } = finalized
    ? {
        label: 'Finalized',
        chrome: 'border-border bg-secondary/60 text-muted-foreground',
      }
    : votingClosed
      ? {
          label: 'Awaiting finalize',
          chrome: 'border-foreground/40 text-foreground/85',
        }
      : {
          label: 'Voting open',
          chrome: 'border-foreground/80 text-foreground',
        }
  return (
    <span
      className={`inline-flex select-none items-center whitespace-nowrap border ${chrome} px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]`}
    >
      {label}
    </span>
  )
}

function BlockMeta({
  endBlock,
  finalized,
  votingClosed,
}: {
  endBlock: bigint | undefined
  finalized: boolean
  votingClosed: boolean
}) {
  const remaining = useBlockCountdown(
    !finalized && !votingClosed ? endBlock : undefined,
  )
  if (endBlock === undefined) return null
  const verb = finalized ? 'closed' : votingClosed ? 'closed at' : 'closes in'
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      {!finalized && !votingClosed && remaining !== null ? (
        <span className="text-foreground/90">
          closes in {formatCountdown(remaining)}
        </span>
      ) : (
        <>
          {verb} block {endBlock.toString()}
        </>
      )}
    </span>
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
    return <InfoBlock>Loading…</InfoBlock>
  }
  if (proposal.finalized) {
    return <Tallies handles={proposal.handles} />
  }
  if (!isConnected) {
    return <InfoBlock>Connect a wallet to vote.</InfoBlock>
  }
  if (memberLoading) {
    return <InfoBlock>Checking membership status…</InfoBlock>
  }
  if (!isMember) {
    return (
      <InfoBlock>
        You need a valid Unlock membership key to act on this proposal.
      </InfoBlock>
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
    <VoteAction
      id={id}
      onStatusChange={onStatusChange}
      onDone={proposal.refetch}
    />
  )
}

function InfoBlock({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
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
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
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
    <div className="flex flex-col items-start gap-4 border border-border bg-secondary/30 px-6 py-8">
      <div>
        <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Voting closed
        </h2>
        <p className="text-sm">
          Reveal the encrypted tallies by finalizing this proposal.
        </p>
      </div>
      <Button onClick={finalize} disabled={isPending} size="lg">
        {isPending ? 'Finalizing…' : 'Finalize proposal'}
      </Button>
    </div>
  )
}

type BallotStage = 'encrypting' | 'submitting' | 'sealed'
type BallotBusy = { choice: 0 | 1 | 2; stage: BallotStage } | null

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
  const [busy, setBusy] = useState<BallotBusy>(null)
  const { data: alreadyDirectlyVoted, refetch: refetchVoted } = useReadContract({
    address: addresses.sepolia.governorLiquid as Hex,
    abi: UnlockConfidentialGovernorLiquidABI,
    functionName: 'hasDirectlyVoted',
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  })
  const { data: countedByAddr, refetch: refetchCountedBy } = useReadContract({
    address: addresses.sepolia.governorLiquid as Hex,
    abi: UnlockConfidentialGovernorLiquidABI,
    functionName: 'countedBy',
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  })
  const { data: myDelegate, refetch: refetchMyDelegate } = useMyDelegate(id, address)
  const claim = useClaimableDelegators(id, address)

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

  async function castBundled(support: 0 | 1 | 2) {
    if (!address) return
    const batch = claim.claimable.slice(0, DELEGATE_BATCH_SIZE) as readonly Hex[]
    setBusy({ choice: support, stage: 'encrypting' })
    onStatusChange('Encrypting vote…')
    try {
      // Two independent encryptions: FHEVM's inputProof is consumed on first
      // `FHE.fromExternal`, so one ciphertext can't satisfy both calls. Same
      // plaintext, two proofs. Both bound to (governor, voter).
      const [encSelf, encDelegate] = await Promise.all([
        encryptVote(addresses.sepolia.governorLiquid as Hex, address, support),
        hasClaimable
          ? encryptVote(addresses.sepolia.governorLiquid as Hex, address, support)
          : Promise.resolve(null),
      ])
      const calls: WriteParams[] = []
      if (hasClaimable && encDelegate) {
        calls.push({
          address: addresses.sepolia.governorLiquid as Hex,
          abi: UnlockConfidentialGovernorLiquidABI,
          functionName: 'castVoteAsDelegate',
          args: [id, encDelegate.handle, encDelegate.inputProof, batch],
        })
      }
      calls.push({
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
        functionName: 'castVote',
        args: [id, encSelf.handle, encSelf.inputProof],
      })
      setBusy({ choice: support, stage: 'submitting' })
      onStatusChange('Submitting transaction…')
      await sponsoredWrite(calls)
      setBusy({ choice: support, stage: 'sealed' })
      onStatusChange(
        hasClaimable
          ? `Voted and claimed ${batch.length} delegator${batch.length === 1 ? '' : 's'}.`
          : 'Vote submitted.',
      )
      await refresh()
    } catch (err) {
      setBusy(null)
      onStatusChange(`Error: ${(err as Error).message}`)
    }
  }

  async function castClaimOnly(support: 0 | 1 | 2) {
    if (!address || !hasClaimable) return
    const batch = claim.claimable.slice(0, DELEGATE_BATCH_SIZE) as readonly Hex[]
    setBusy({ choice: support, stage: 'encrypting' })
    onStatusChange('Encrypting vote…')
    try {
      const enc = await encryptVote(addresses.sepolia.governorLiquid as Hex, address, support)
      setBusy({ choice: support, stage: 'submitting' })
      onStatusChange('Submitting transaction…')
      await sponsoredWrite({
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
        functionName: 'castVoteAsDelegate',
        args: [id, enc.handle, enc.inputProof, batch],
      })
      setBusy({ choice: support, stage: 'sealed' })
      onStatusChange(
        `Claimed ${batch.length} delegator${batch.length === 1 ? '' : 's'}.`,
      )
      await refresh()
    } catch (err) {
      setBusy(null)
      onStatusChange(`Error: ${(err as Error).message}`)
    }
  }

  // Decide which PRIMARY block to render. Only one at a time.
  let primary: React.ReactNode
  if (alreadyDirectlyVoted) {
    primary = (
      <SealedBlock>
        Your ballot is sealed in this motion.
      </SealedBlock>
    )
  } else if (hasDelegate && !countedByDelegate) {
    primary = (
      <DelegationCertificate
        delegate={myDelegate as Hex}
        onRevoke={() =>
          doUndelegate(sponsoredWrite, id, onStatusChange, refresh).catch(
            () => {},
          )
        }
        isPending={isPending}
      />
    )
  } else {
    primary = (
      <VoteBlock
        isPending={isPending}
        busy={busy}
        hasClaimable={hasClaimable}
        hasExcluded={hasExcluded}
        countedByDelegate={Boolean(countedByDelegate)}
        countedByAddr={countedByAddr}
        claimableCount={claim.claimable.length}
        excludedCount={claim.excluded.length}
        overflow={overflow}
        onVote={castBundled}
      />
    )
  }

  // SECONDARY: either the tail claim-only block (already-voted with delegators
  // still to collect) OR the delegate picker (haven't voted, haven't delegated).
  let secondary: React.ReactNode = null
  if (alreadyDirectlyVoted && hasClaimable) {
    secondary = (
      <ClaimOnlyBlock
        isPending={isPending}
        busy={busy}
        claimableCount={claim.claimable.length}
        excludedCount={claim.excluded.length}
        overflow={overflow}
        onClaim={castClaimOnly}
      />
    )
  } else if (!alreadyDirectlyVoted && !hasDelegate) {
    secondary = (
      <DelegatePickerBlock
        id={id}
        onStatusChange={onStatusChange}
        onDone={refresh}
      />
    )
  }

  return (
    <div>
      {primary}
      {secondary ? (
        <>
          <div className="my-10 border-t border-border" />
          {secondary}
        </>
      ) : null}
    </div>
  )
}

async function doUndelegate(
  sponsoredWrite: ReturnType<typeof useSponsoredWrite>['mutateAsync'],
  id: bigint,
  onStatusChange: (s: string) => void,
  refresh: () => Promise<unknown>,
) {
  onStatusChange('Revoking delegation…')
  try {
    await sponsoredWrite({
      address: addresses.sepolia.liquidDelegation as Hex,
      abi: LiquidDelegationABI,
      functionName: 'undelegate',
      args: [id],
    })
    onStatusChange('Delegation revoked.')
    await refresh()
  } catch (err) {
    onStatusChange(`Error: ${(err as Error).message}`)
  }
}

// ============================================================
// PRIMARY BLOCKS
// ============================================================

function VoteBlock({
  isPending,
  busy,
  hasClaimable,
  hasExcluded,
  countedByDelegate,
  countedByAddr,
  claimableCount,
  excludedCount,
  overflow,
  onVote,
}: {
  isPending: boolean
  busy: BallotBusy
  hasClaimable: boolean
  hasExcluded: boolean
  countedByDelegate: boolean
  countedByAddr: Hex | undefined
  claimableCount: number
  excludedCount: number
  overflow: boolean
  onVote: (support: 0 | 1 | 2) => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Cast your ballot
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          ◆ Encrypted end-to-end
        </span>
      </div>

      {countedByDelegate && countedByAddr ? (
        <p className="border-l-2 border-foreground/60 pl-4 text-sm italic text-muted-foreground">
          Your vote was already cast by{' '}
          <code className="font-mono not-italic text-foreground/85">
            {truncateAddress(countedByAddr)}
          </code>
          . Casting below overrides that.
        </p>
      ) : null}

      {hasClaimable ? (
        <p className="border-l-2 border-foreground/60 pl-4 text-sm italic">
          <BundledVoteDescription
            claimableCount={claimableCount}
            excludedCount={excludedCount}
            overflow={overflow}
          />
        </p>
      ) : hasExcluded ? (
        <p className="border-l-2 border-border pl-4 text-sm italic text-muted-foreground">
          {excludedCount} of your delegator
          {excludedCount === 1 ? ' has' : 's have'} already voted directly — only
          your own vote will be cast.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {([
          { label: 'For', index: 1, primary: true },
          { label: 'Against', index: 0, primary: false },
          { label: 'Abstain', index: 2, primary: false },
        ] as const).map((c) => (
          <ChoiceButton
            key={c.index}
            label={c.label}
            index={c.index}
            onClick={() => onVote(c.index)}
            disabled={isPending || busy !== null}
            primary={c.primary}
            busyStage={busy?.choice === c.index ? busy.stage : undefined}
            dimmed={busy !== null && busy.choice !== c.index}
          />
        ))}
      </div>
    </div>
  )
}

function ChoiceButton({
  label,
  index,
  onClick,
  disabled,
  primary,
  busyStage,
  dimmed,
}: {
  label: string
  index: 0 | 1 | 2
  onClick: () => void
  disabled: boolean
  primary?: boolean
  busyStage?: BallotStage
  dimmed?: boolean
}) {
  const base =
    'group relative flex flex-col items-start gap-3 overflow-hidden border px-5 py-5 text-left transition-all duration-500 disabled:cursor-not-allowed'
  const idle = primary
    ? 'border-foreground bg-foreground text-background hover:bg-foreground/90'
    : 'border-border bg-transparent text-foreground hover:border-foreground/70 hover:bg-accent'
  const active = primary
    ? 'border-foreground bg-foreground text-background'
    : 'border-foreground bg-accent text-foreground'
  const dim = 'border-border/40 bg-transparent text-foreground/25 saturate-0'
  const chrome = busyStage ? active : dimmed ? dim : idle

  const topLabel = busyStage ?? (index === 1 ? 'yea' : index === 0 ? 'nay' : 'abstain')

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={Boolean(busyStage)}
      className={`${base} ${chrome}`}
    >
      {busyStage && busyStage !== 'sealed' ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 w-[2px] [animation:ballot-sweep_1.8s_cubic-bezier(.55,0,.45,1)_infinite] ${
            primary ? 'bg-background/80' : 'bg-foreground/70'
          }`}
        />
      ) : null}

      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">
        {busyStage ? (
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rotate-45 ${
              busyStage === 'sealed' ? '' : '[animation:ballot-pulse_1.2s_ease-in-out_infinite]'
            } ${primary ? 'bg-background' : 'bg-foreground'}`}
          />
        ) : null}
        <span>{topLabel}</span>
      </span>

      <span className="text-2xl font-semibold tracking-tight">{label}</span>

      {busyStage ? (
        <span
          aria-hidden
          className="flex gap-1 font-mono text-[11px] leading-none tracking-[0.28em]"
        >
          {([0, 1, 2] as const).map((i) => {
            const filled =
              i <
              (busyStage === 'encrypting'
                ? 1
                : busyStage === 'submitting'
                  ? 2
                  : 3)
            return (
              <span
                key={i}
                className={`transition-opacity duration-300 ${filled ? 'opacity-100' : 'opacity-25'}`}
              >
                ◆
              </span>
            )
          })}
        </span>
      ) : null}
    </button>
  )
}

function DelegationCertificate({
  delegate,
  onRevoke,
  isPending,
}: {
  delegate: Hex
  onRevoke: () => void
  isPending: boolean
}) {
  return (
    <div className="relative border-2 border-border bg-secondary/30 px-6 py-8">
      <div className="absolute left-6 top-0 -translate-y-1/2 bg-background px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Delegation active
      </div>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Your ballot is held by
          </div>
          <code className="block text-lg font-mono text-foreground">
            {truncateAddress(delegate)}
          </code>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          They&rsquo;ll cast your vote on this motion. Revoke to reclaim it and
          vote yourself.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRevoke}
          disabled={isPending}
        >
          Revoke delegation
        </Button>
      </div>
    </div>
  )
}

function SealedBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-b border-border py-10 text-center">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Ballot recorded
      </div>
      <p className="text-lg text-foreground">{children}</p>
    </div>
  )
}

// ============================================================
// SECONDARY BLOCKS
// ============================================================

function ClaimOnlyBlock({
  isPending,
  busy,
  claimableCount,
  excludedCount,
  overflow,
  onClaim,
}: {
  isPending: boolean
  busy: BallotBusy
  claimableCount: number
  excludedCount: number
  overflow: boolean
  onClaim: (support: 0 | 1 | 2) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          You still hold delegated voting power
        </h2>
        <p className="text-sm text-muted-foreground">
          <DelegatorClaimDescription
            claimableCount={claimableCount}
            excludedCount={excludedCount}
            overflow={overflow}
          />
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {([
          { label: 'Claim as For', index: 1 },
          { label: 'Claim as Against', index: 0 },
          { label: 'Claim as Abstain', index: 2 },
        ] as const).map((c) => (
          <ChoiceButton
            key={c.index}
            label={c.label}
            index={c.index}
            onClick={() => onClaim(c.index)}
            disabled={isPending || busy !== null}
            busyStage={busy?.choice === c.index ? busy.stage : undefined}
            dimmed={busy !== null && busy.choice !== c.index}
          />
        ))}
      </div>
    </div>
  )
}

function DelegatePickerBlock({
  id,
  onStatusChange,
  onDone,
}: {
  id: bigint
  onStatusChange: (s: string) => void
  onDone: () => Promise<unknown>
}) {
  const { address } = useAccount()
  const [addr, setAddr] = useState('')
  const { mutateAsync: sponsoredWrite, isPending } = useSponsoredWrite()
  const { data: members = [], isLoading: membersLoading } = useAllMembers()
  const { data: subnames } = useClaimedSubnames()
  const owners = useMemo(() => members.map((m) => m.owner), [members])
  // `all` is the caller's transitive reverse-delegation set — delegating to
  // any of them would cycle. Wagmi dedupes this read with the one in
  // VoteAction's useClaimableDelegators, so calling it here is free.
  const myTransitive = useClaimableDelegators(id, address)
  const cycleSet = useMemo(() => {
    const s = new Set<string>()
    for (const d of myTransitive.all) s.add(d.toLowerCase())
    return s
  }, [myTransitive.all])

  const normalized = isAddress(addr) ? (addr as Hex) : undefined
  const check = useDelegationTargetCheck(id, address, normalized)
  const targetError = describeDelegationReason(check.reason)

  const filteredMembers = useMemo(() => {
    const self = address?.toLowerCase()
    const query = addr.trim().toLowerCase()
    const rows = owners
      .filter((owner) => {
        const lower = owner.toLowerCase()
        if (self && lower === self) return false
        if (cycleSet.has(lower)) return false
        return true
      })
      .map((owner) => ({ owner, name: subnames?.get(owner.toLowerCase()) }))
    const matched =
      query.length === 0
        ? rows
        : rows.filter(
            (r) =>
              r.owner.toLowerCase().includes(query) ||
              (r.name ? r.name.toLowerCase().includes(query) : false),
          )
    // Named members first so community identities surface over raw hex.
    matched.sort((a, b) => {
      if (!!a.name === !!b.name) {
        return (a.name ?? a.owner).localeCompare(b.name ?? b.owner)
      }
      return a.name ? -1 : 1
    })
    return matched.map((r) => r.owner)
  }, [owners, subnames, address, addr, cycleSet])

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
        address: addresses.sepolia.liquidDelegation as Hex,
        abi: LiquidDelegationABI,
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

  const checking = Boolean(normalized) && check.isLoading
  const buttonDisabled = isPending || !normalized || checking || !check.ok
  const selectedLower = normalized?.toLowerCase()

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Or delegate your vote
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Per-proposal · revocable
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          placeholder="Search name or paste 0x…"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          className="flex-1 border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
          spellCheck={false}
        />
        <Button onClick={doDelegate} disabled={buttonDisabled} variant="outline">
          Delegate
        </Button>
      </div>

      {addr && !normalized ? (
        <p className="border-l-2 border-destructive pl-3 text-xs italic text-destructive">
          Not a valid 0x address.
        </p>
      ) : checking ? (
        <p className="border-l-2 border-border pl-3 text-xs italic text-muted-foreground">
          Checking target…
        </p>
      ) : targetError ? (
        <p className="border-l-2 border-destructive pl-3 text-xs italic text-destructive">
          {targetError}
        </p>
      ) : null}

      <MemberPickerList
        isLoading={membersLoading}
        totalOwners={owners.length}
        filtered={filteredMembers}
        selectedLower={selectedLower}
        onPick={setAddr}
      />
    </div>
  )
}

function MemberPickerList({
  isLoading,
  totalOwners,
  filtered,
  selectedLower,
  onPick,
}: {
  isLoading: boolean
  totalOwners: number
  filtered: readonly Hex[]
  selectedLower: string | undefined
  onPick: (addr: Hex) => void
}) {
  if (isLoading) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Loading members…
      </p>
    )
  }
  if (totalOwners === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        No members yet — paste an address to delegate.
      </p>
    )
  }
  if (filtered.length === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        No matching members.
      </p>
    )
  }
  return (
    <div className="max-h-64 divide-y divide-border overflow-y-auto border border-border">
      {filtered.map((owner) => (
        <DelegatePickerRow
          key={owner}
          owner={owner}
          isSelected={selectedLower === owner.toLowerCase()}
          onPick={onPick}
        />
      ))}
    </div>
  )
}

function DelegatePickerRow({
  owner,
  isSelected,
  onPick,
}: {
  owner: Hex
  isSelected: boolean
  onPick: (addr: Hex) => void
}) {
  const { data: name } = useIdentity(owner)
  return (
    <button
      type="button"
      onClick={() => onPick(owner)}
      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? 'bg-accent text-foreground'
          : 'text-foreground/85 hover:bg-accent/60 hover:text-foreground'
      }`}
    >
      <span className="min-w-0 flex items-baseline gap-3">
        <span className="truncate font-serif text-[15px]">
          {name ?? truncateAddress(owner)}
        </span>
        {name ? (
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {truncateAddress(owner)}
          </span>
        ) : null}
      </span>
      {isSelected ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          selected
        </span>
      ) : null}
    </button>
  )
}

// ============================================================
// TALLIES (finalized hero)
// ============================================================

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
    return (
      <div className="border-t border-b border-border py-16 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Decrypting tallies…
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <p className="border-l-2 border-destructive pl-4 text-sm italic text-destructive">
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
  const max = rows.reduce((m, r) => (r.value > m ? r.value : m), 0n)

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Final tally
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Revealed via Zama FHEVM
        </span>
      </div>
      <div className="grid grid-cols-3 border-t border-b border-border">
        {rows.map((r) => {
          const isMax = max > 0n && r.value === max
          return (
            <div
              key={r.label}
              className="flex flex-col items-center gap-3 border-r border-border py-10 last:border-r-0"
            >
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {r.label}
              </div>
              <div
                className={`text-[4rem] font-light leading-none tabular-nums ${isMax ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {r.value.toString()}
              </div>
              {isMax ? (
                <div className="h-px w-8 bg-foreground" />
              ) : (
                <div className="h-px w-8 bg-transparent" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// SHARED UTIL
// ============================================================

function BundledVoteDescription({
  claimableCount,
  excludedCount,
  overflow,
}: {
  claimableCount: number
  excludedCount: number
  overflow: boolean
}) {
  const claimed = overflow ? DELEGATE_BATCH_SIZE : claimableCount
  const remaining = overflow ? claimableCount - DELEGATE_BATCH_SIZE : 0
  const excluded =
    excludedCount > 0
      ? ` ${excludedCount} delegator${excludedCount === 1 ? ' has' : 's have'} already voted directly and won't be included.`
      : ''
  const remainder =
    remaining > 0
      ? ` Click again after this batch lands to claim the remaining ${remaining}.`
      : ''
  return (
    <>
      Your vote + {claimed} delegator vote{claimed === 1 ? '' : 's'} will be
      cast together.{excluded}
      {remainder}
    </>
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

// ---------- Proposal brief ----------

function ProposalBrief({ body }: { body: ProposalBody }) {
  const totalLabel = formatAmount(body.totalCost)
  return (
    <article className="mb-12 space-y-12">
      {body.problem ? (
        <BriefSection n="01" title="Problem statement">
          <BriefProse>{body.problem}</BriefProse>
        </BriefSection>
      ) : null}

      {body.solution ? (
        <BriefSection n="02" title="Proposed solution">
          <BriefProse>{body.solution}</BriefProse>
        </BriefSection>
      ) : null}

      {body.costs.length > 0 ? (
        <BriefSection n="03" title="Detailed cost breakdown">
          <div className="border-t border-border">
            <div className="grid grid-cols-[1fr_9rem] border-b border-border py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>Item</span>
              <span className="text-right">Amount · USDC</span>
            </div>
            {body.costs.map((c, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_9rem] border-b border-border py-3"
              >
                <span className="pr-4 font-serif text-[15px] text-foreground">
                  {c.item || '—'}
                </span>
                <span className="text-right font-mono text-[14px] tabular-nums text-foreground">
                  {c.amount || '0'}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_9rem] py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Total
              </span>
              <span className="text-right font-mono text-lg tabular-nums text-foreground">
                {totalLabel}
              </span>
            </div>
          </div>
        </BriefSection>
      ) : null}

      {body.outcomes ? (
        <BriefSection n="04" title="Expected community outcomes">
          <BriefProse>{body.outcomes}</BriefProse>
        </BriefSection>
      ) : null}

      {body.milestones.length > 0 ? (
        <BriefSection n="05" title="Funding timeline">
          <ol className="border-t border-border">
            {body.milestones.map((m, i) => (
              <li
                key={i}
                className="grid grid-cols-[3rem_minmax(0,1fr)_9rem] items-start gap-4 border-b border-border py-4"
              >
                <span className="font-mono text-[12px] uppercase tracking-[0.18em] tabular-nums text-foreground">
                  {m.label || `M${i + 1}`}
                </span>
                <div className="min-w-0">
                  <div className="font-serif text-[15px] text-foreground">
                    {m.detail || '—'}
                  </div>
                  {m.date ? (
                    <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      {m.date}
                    </div>
                  ) : null}
                </div>
                <span className="text-right font-mono text-[14px] tabular-nums text-foreground">
                  {m.amount ? `${m.amount}` : '—'}
                </span>
              </li>
            ))}
          </ol>
        </BriefSection>
      ) : null}

      <BriefSection n="06" title="Authors">
        <ul className="border-t border-border">
          <BriefAuthor address={body.authors.lead} role="lead" />
          {body.authors.coAuthors.map((a) => (
            <BriefAuthor key={a} address={a} role="co" />
          ))}
        </ul>
        {body.credentials ? (
          <div className="mt-6">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Credentials
            </div>
            <BriefProse>{body.credentials}</BriefProse>
          </div>
        ) : null}
      </BriefSection>
    </article>
  )
}

function BriefSection({
  n,
  title,
  children,
}: {
  n: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-5 flex items-baseline gap-4 border-b border-border pb-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] tabular-nums text-foreground">
          §&nbsp;{n}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
          {title}
        </span>
      </div>
      {children}
    </section>
  )
}

function BriefProse({ children }: { children: string }) {
  return (
    <div className="whitespace-pre-wrap border-l-2 border-foreground/10 pl-5 font-serif text-[17px] leading-relaxed text-foreground/90">
      {children}
    </div>
  )
}

function BriefAuthor({
  address,
  role,
}: {
  address: Address
  role: 'lead' | 'co'
}) {
  const { data: name } = useIdentity(address)
  return (
    <li className="border-b border-border">
      <Link
        to="/members/$address"
        params={{ address }}
        className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-accent/40"
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {role === 'lead' ? 'Lead' : 'Co'}
          </span>
          <span className="truncate font-serif text-[16px] text-foreground">
            {name ?? truncateAddress(address)}
          </span>
          {name ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {truncateAddress(address)}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  )
}

function formatAmount(n: number) {
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

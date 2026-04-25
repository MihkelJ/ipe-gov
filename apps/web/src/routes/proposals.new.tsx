import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { Address, Hex } from 'viem'
import { useAccount, useSignMessage } from 'wagmi'
import { UnlockConfidentialGovernorLiquidABI, addresses } from '@ipe-gov/sdk'
import type { ProposalBody } from '@ipe-gov/ipfs'
import { useSponsoredWrite } from '../hooks/useSponsoredWrite'
import { buildPinMessage, hashBody, pinDescription } from '../lib/pinApi'
import { useAllMembers } from '../hooks/useMembers'
import { useClaimedSubnames, useIdentity } from '#/hooks/useIdentity'
import { truncateAddress } from '#/lib/address'
import RequireUnlockMembership from '#/components/RequireUnlockMembership'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/proposals/new')({
  head: () => ({ meta: [{ title: 'Draft a motion — ipe-gov' }] }),
  component: NewProposalGuarded,
})

function NewProposalGuarded() {
  return (
    <RequireUnlockMembership>
      <NewProposalPage />
    </RequireUnlockMembership>
  )
}

type Phase = 'idle' | 'signing' | 'pinning' | 'submitting' | 'done' | 'error'

const STEPS: Array<{ key: Exclude<Phase, 'idle' | 'error'>; label: string }> = [
  { key: 'signing', label: 'Sign intent' },
  { key: 'pinning', label: 'Pin to IPFS' },
  { key: 'submitting', label: 'Record on-chain' },
  { key: 'done', label: 'Entered' },
]

const HEADLINE_MAX = 160

type CostLine = { id: string; item: string; amount: string }
type Milestone = { id: string; label: string; date: string; amount: string; detail: string }

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

function NewProposalPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { mutateAsync: sponsoredWrite } = useSponsoredWrite()

  const [headline, setHeadline] = useState('')
  const [problem, setProblem] = useState('')
  const [solution, setSolution] = useState('')
  const [outcomes, setOutcomes] = useState('')
  const [credentials, setCredentials] = useState('')
  const [costs, setCosts] = useState<CostLine[]>([
    { id: newId(), item: '', amount: '' },
  ])
  const [milestones, setMilestones] = useState<Milestone[]>([
    { id: newId(), label: 'M1', date: '', amount: '', detail: '' },
  ])
  const [coAuthors, setCoAuthors] = useState<Address[]>([])

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  const headlineTrim = headline.trim()
  const headlineOver = headline.length > HEADLINE_MAX
  const busy =
    phase === 'signing' || phase === 'pinning' || phase === 'submitting'

  const totalCost = useMemo(
    () =>
      costs.reduce((acc, c) => {
        const n = Number(c.amount)
        return acc + (Number.isFinite(n) ? n : 0)
      }, 0),
    [costs],
  )
  // Only rows with BOTH an item and a positive amount are considered complete.
  // Half-filled rows are skipped on submit — the Worker would reject them.
  const filledCostLines = costs.filter(
    (c) => c.item.trim() && c.amount.trim() && Number(c.amount) > 0,
  )
  // Label alone doesn't count — every row is seeded with "M{n}", so including
  // it here would mark the timeline complete before the user has entered any
  // data. A milestone needs at least a date, amount, or deliverable.
  const filledMilestones = milestones.filter(
    (m) => m.date || m.amount.trim() || m.detail.trim(),
  )

  // Cost breakdown is optional — some proposals don't ask for funding. If any
  // lines are partially filled, though, they must sum to a positive amount.
  // A funding timeline is only required when there's a cost breakdown to
  // schedule; proposals without costs can omit it.
  const costsValid = filledCostLines.length === 0 || totalCost > 0
  const timelineRequired = filledCostLines.length > 0
  const completion = {
    motion: headlineTrim.length > 0 && !headlineOver,
    problem: problem.trim().length >= 40,
    solution: solution.trim().length >= 40,
    outcomes: outcomes.trim().length >= 40,
    timeline: !timelineRequired || filledMilestones.length > 0,
    authors: true, // lead author always present
  }
  const completeCount = Object.values(completion).filter(Boolean).length
  const canSubmit =
    isConnected &&
    !!address &&
    completion.motion &&
    completion.problem &&
    completion.solution &&
    completion.outcomes &&
    completion.timeline &&
    costsValid &&
    !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!address || !canSubmit) return
    setError(null)
    try {
      const structured: ProposalBody = {
        schema: 'ipe-gov.proposal-body/1',
        headline: headlineTrim,
        problem: problem.trim(),
        solution: solution.trim(),
        outcomes: outcomes.trim(),
        credentials: credentials.trim() || undefined,
        costs: filledCostLines.map((c) => ({
          item: c.item.trim(),
          amount: c.amount.trim(),
        })),
        totalCost,
        milestones: filledMilestones.map((m) => ({
          label: m.label.trim(),
          date: m.date,
          amount: m.amount.trim(),
          detail: m.detail.trim(),
        })),
        authors: { lead: address, coAuthors },
      }

      setPhase('signing')
      const message = buildPinMessage(address, Date.now(), hashBody(structured))
      const signature = await signMessageAsync({ message })

      setPhase('pinning')
      const { cid } = await pinDescription({
        data: {
          text: headlineTrim,
          address,
          signature,
          message,
          body: structured,
        },
      })

      setPhase('submitting')
      await sponsoredWrite({
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
        functionName: 'propose',
        args: [cid],
      })

      setPhase('done')
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }

  useEffect(() => {
    if (phase !== 'done') return
    const id = setTimeout(() => router.navigate({ to: '/proposals' }), 700)
    return () => clearTimeout(id)
  }, [phase, router])

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
      <nav className="mb-10 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        <Link
          to="/proposals"
          className="transition-colors hover:text-foreground"
        >
          ← The Register
        </Link>
      </nav>

      <header className="border-b border-border pb-8">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          The Register · Sepolia · Drafting chamber
        </div>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
          File a motion
        </h1>
        <p className="mt-5 max-w-xl font-serif text-[17px] leading-relaxed text-muted-foreground">
          A motion before the assembly is more than a sentence. Set out the
          problem, the proposal, and the ledger that funds it. The full record
          is pinned to IPFS; only the content identifier is inscribed on-chain.
        </p>
      </header>

      <div className="mt-12 grid gap-16 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={submit} className="min-w-0 space-y-14">
          {/* § 01 — Motion headline */}
          <section>
            <SectionHeader n="01" title="The motion" hint="A single decisive headline" />
            <div className="relative mt-5">
              <textarea
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                disabled={busy || phase === 'done'}
                placeholder="Resolved, that the assembly shall…"
                rows={3}
                className="w-full resize-none border-0 border-b border-foreground/30 bg-transparent px-0 pb-4 pt-1 font-serif text-3xl leading-snug tracking-tight text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground disabled:opacity-60"
                aria-label="Motion headline"
              />
              <FieldMeta
                left={`${headlineTrim ? wordCount(headlineTrim) : 0} words`}
                right={`${HEADLINE_MAX - headline.length} / ${HEADLINE_MAX}`}
                warn={headlineOver}
              />
            </div>
          </section>

          {/* § 02 — Problem statement */}
          <Prose
            n="02"
            title="Problem statement"
            hint="What, concretely, is wrong today"
            value={problem}
            onChange={setProblem}
            placeholder="Describe the situation the assembly must correct. Quantify where possible."
            disabled={busy || phase === 'done'}
          />

          {/* § 03 — Proposed solution */}
          <Prose
            n="03"
            title="Proposed solution"
            hint="The action the assembly is asked to authorise"
            value={solution}
            onChange={setSolution}
            placeholder="Describe what will be done, by whom, and how the work will be held accountable."
            disabled={busy || phase === 'done'}
          />

          {/* § 04 — Detailed cost breakdown */}
          <section>
            <SectionHeader
              n="04"
              title="Detailed cost breakdown"
              hint="Every line accounted for"
            />
            <div className="mt-5 border-t border-border">
              <div className="grid grid-cols-[1fr_9rem_2.5rem] items-center border-b border-border py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span>Item</span>
                <span className="pl-2">Amount · USDC</span>
                <span />
              </div>
              {costs.map((line, i) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[1fr_9rem_2.5rem] items-center border-b border-border"
                >
                  <input
                    value={line.item}
                    onChange={(e) =>
                      setCosts((cs) =>
                        cs.map((c) =>
                          c.id === line.id ? { ...c, item: e.target.value } : c,
                        ),
                      )
                    }
                    placeholder={i === 0 ? 'e.g. Honorarium — Workshop facilitator' : 'Line item'}
                    disabled={busy || phase === 'done'}
                    className="border-0 bg-transparent py-3 pr-4 font-serif text-[15px] text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                  <input
                    value={line.amount}
                    onChange={(e) =>
                      setCosts((cs) =>
                        cs.map((c) =>
                          c.id === line.id
                            ? { ...c, amount: sanitiseAmount(e.target.value) }
                            : c,
                        ),
                      )
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                    disabled={busy || phase === 'done'}
                    className="border-0 border-l border-border bg-transparent py-3 pl-3 pr-2 text-right font-mono text-[14px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCosts((cs) =>
                        cs.length === 1
                          ? cs
                          : cs.filter((c) => c.id !== line.id),
                      )
                    }
                    disabled={costs.length === 1 || busy}
                    aria-label="Remove line"
                    className="flex h-full items-center justify-center border-l border-border font-mono text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_9rem_2.5rem] items-center py-3">
                <button
                  type="button"
                  onClick={() =>
                    setCosts((cs) => [
                      ...cs,
                      { id: newId(), item: '', amount: '' },
                    ])
                  }
                  disabled={busy}
                  className="justify-self-start font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  + Add line
                </button>
                <div className="border-l border-border pl-3 pr-2 text-right">
                  <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                    Total
                  </div>
                  <div className="font-mono text-lg tabular-nums text-foreground">
                    {formatAmount(totalCost)}
                  </div>
                </div>
                <span />
              </div>
            </div>
          </section>

          {/* § 05 — Expected community outcomes */}
          <Prose
            n="05"
            title="Expected community outcomes"
            hint="How the assembly will know it worked"
            value={outcomes}
            onChange={setOutcomes}
            placeholder="Name the measurable changes. Who benefits, by how much, and by when."
            disabled={busy || phase === 'done'}
          />

          {/* § 06 — Funding timeline */}
          <section>
            <SectionHeader
              n="06"
              title="Funding timeline"
              hint="Milestones that release funds"
            />
            <ol className="mt-5 border-t border-border">
              {milestones.map((m, i) => (
                <li
                  key={m.id}
                  className="grid grid-cols-[3rem_minmax(0,1fr)_9rem_2.5rem] items-start gap-4 border-b border-border py-4"
                >
                  <input
                    value={m.label}
                    onChange={(e) =>
                      setMilestones((ms) =>
                        ms.map((x) =>
                          x.id === m.id ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder={`M${i + 1}`}
                    disabled={busy || phase === 'done'}
                    className="border-0 border-b border-transparent bg-transparent py-1 font-mono text-[12px] uppercase tracking-[0.18em] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-foreground/40"
                  />
                  <div className="min-w-0">
                    <input
                      value={m.detail}
                      onChange={(e) =>
                        setMilestones((ms) =>
                          ms.map((x) =>
                            x.id === m.id ? { ...x, detail: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="What is delivered at this milestone"
                      disabled={busy || phase === 'done'}
                      className="w-full border-0 bg-transparent py-1 font-serif text-[15px] text-foreground outline-none placeholder:text-muted-foreground/40"
                    />
                    <input
                      type="date"
                      value={m.date}
                      onChange={(e) =>
                        setMilestones((ms) =>
                          ms.map((x) =>
                            x.id === m.id ? { ...x, date: e.target.value } : x,
                          ),
                        )
                      }
                      disabled={busy || phase === 'done'}
                      className="mt-1 border-0 bg-transparent px-0 py-0 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground outline-none [color-scheme:light_dark] focus:text-foreground"
                    />
                  </div>
                  <input
                    value={m.amount}
                    onChange={(e) =>
                      setMilestones((ms) =>
                        ms.map((x) =>
                          x.id === m.id
                            ? { ...x, amount: sanitiseAmount(e.target.value) }
                            : x,
                        ),
                      )
                    }
                    inputMode="decimal"
                    placeholder="Amount"
                    disabled={busy || phase === 'done'}
                    className="border-0 border-l border-border bg-transparent py-1 pl-3 pr-2 text-right font-mono text-[14px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setMilestones((ms) =>
                        ms.length === 1
                          ? ms
                          : ms.filter((x) => x.id !== m.id),
                      )
                    }
                    disabled={milestones.length === 1 || busy}
                    aria-label="Remove milestone"
                    className="mt-1 justify-self-center font-mono text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() =>
                setMilestones((ms) => [
                  ...ms,
                  {
                    id: newId(),
                    label: `M${ms.length + 1}`,
                    date: '',
                    amount: '',
                    detail: '',
                  },
                ])
              }
              disabled={busy}
              className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
            >
              + Add milestone
            </button>
          </section>

          {/* § 07 — Author credentials */}
          <section>
            <SectionHeader
              n="07"
              title="Author credentials"
              hint="Who stands behind the motion"
            />

            <div className="mt-5 border-t border-border pt-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Lead author
              </div>
              {address ? (
                <ul className="mt-2 border-y border-border">
                  <AuthorRow address={address} role="lead" />
                </ul>
              ) : (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  Connect a wallet to take lead authorship.
                </p>
              )}

              <div className="mt-6">
                <div className="mb-3 flex items-baseline justify-between">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Co-authors · from the community
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground tabular-nums">
                    {coAuthors.length} added
                  </div>
                </div>

                {coAuthors.length > 0 ? (
                  <ul className="mb-4 divide-y divide-border border-y border-border">
                    {coAuthors.map((a) => (
                      <AuthorRow
                        key={a}
                        address={a}
                        role="co-author"
                        onRemove={() =>
                          setCoAuthors((xs) => xs.filter((x) => x !== a))
                        }
                      />
                    ))}
                  </ul>
                ) : null}

                <CommunityPicker
                  selfAddress={address}
                  selected={coAuthors}
                  onAdd={(a) =>
                    setCoAuthors((xs) => (xs.includes(a) ? xs : [...xs, a]))
                  }
                />
              </div>

              <div className="mt-6">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Credentials (optional)
                </div>
                <textarea
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value)}
                  disabled={busy || phase === 'done'}
                  placeholder="Relevant prior work, references, roles. Plain text; no gloss needed."
                  rows={4}
                  className="w-full resize-y border border-border bg-transparent p-3 font-serif text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-foreground/60"
                />
              </div>
            </div>
          </section>

          {/* § 08 — Passage pipeline */}
          <section>
            <SectionHeader n="08" title="Passage" hint="Signing, pinning, recording" />
            <ol className="mt-5">
              {STEPS.map((step, i) => {
                const state = stepState(phase, step.key)
                return (
                  <li
                    key={step.key}
                    className="grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-6 border-b border-border py-4"
                  >
                    <span
                      className={`font-mono text-[11px] uppercase tracking-[0.2em] tabular-nums ${
                        state === 'active' ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      §&nbsp;{String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={`text-base ${
                        state === 'done'
                          ? 'text-muted-foreground line-through decoration-foreground/30'
                          : state === 'active'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {state === 'active'
                        ? '· in progress'
                        : state === 'done'
                          ? 'done'
                          : state === 'pending'
                            ? 'waiting'
                            : ''}
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>

          <div className="flex items-center justify-between gap-6">
            <div
              role={error ? 'alert' : undefined}
              className={`min-w-0 font-mono text-[11px] uppercase tracking-[0.14em] ${
                error ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {error ? (
                <span className="break-words">Error · {error}</span>
              ) : phase === 'done' ? (
                'Motion accepted — returning to the register'
              ) : busy ? (
                STEPS.find((s) => s.key === phase)?.label
              ) : !isConnected ? (
                'Sign in to file a motion'
              ) : canSubmit ? (
                'Ready to file'
              ) : (
                `Complete all sections (${completeCount} / 6)`
              )}
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/proposals"
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Discard
              </Link>
              <Button type="submit" disabled={!canSubmit} size="lg">
                {busy ? 'Filing…' : phase === 'done' ? 'Filed' : 'File motion'}
              </Button>
            </div>
          </div>
        </form>

        <aside className="lg:sticky lg:top-24 lg:self-start lg:border-l lg:border-border lg:pl-10">
          <SectionHeader n="A" title="Cover sheet" muted />

          <div className="mt-5 border border-border bg-secondary/30 px-5 py-5">
            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span>Motion · draft</span>
              <span className="tabular-nums">№ pending</span>
            </div>
            <p
              className={`mt-4 font-serif text-lg leading-snug ${
                headlineTrim ? 'text-foreground' : 'text-muted-foreground/60 italic'
              }`}
            >
              {headlineTrim || 'Resolved, that the assembly shall…'}
            </p>
            <div className="mt-5 border-t border-border pt-4">
              <SheetRow
                label="Budget"
                value={totalCost > 0 ? `${formatAmount(totalCost)} USDC` : '—'}
              />
              <SheetRow
                label="Milestones"
                value={filledMilestones.length ? String(filledMilestones.length) : '—'}
              />
              <SheetRow
                label="Authors"
                value={String(1 + coAuthors.length)}
              />
              <SheetRow
                label="Moved by"
                value={
                  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'
                }
              />
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Completion
            </div>
            <ul className="border-t border-border">
              {(
                [
                  ['motion', 'Motion headline'],
                  ['problem', 'Problem statement'],
                  ['solution', 'Proposed solution'],
                  ['outcomes', 'Community outcomes'],
                  ['timeline', 'Funding timeline'],
                  ['authors', 'Authors'],
                ] as const
              ).map(([k, label]) => (
                <li
                  key={k}
                  className="flex items-center justify-between border-b border-border py-2 font-mono text-[11px] uppercase tracking-[0.14em]"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span
                    className={
                      completion[k] ? 'text-foreground' : 'text-muted-foreground/50'
                    }
                  >
                    {completion[k] ? '●' : '○'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 space-y-5 font-serif text-[13px] leading-relaxed text-muted-foreground">
            <p>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/90">
                On the record.
              </span>{' '}
              The full brief — sections, ledger, milestones, authors — is
              pinned to IPFS. Only its content identifier is stored on-chain.
            </p>
            <p>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/90">
                On gas.
              </span>{' '}
              Submission is sponsored. You pay nothing; members vote in
              confidence.
            </p>
          </div>
        </aside>
      </div>
    </main>
  )
}

function SheetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground/90">{value}</span>
    </div>
  )
}

function SectionHeader({
  n,
  title,
  hint,
  muted,
}: {
  n: string
  title: string
  hint?: string
  muted?: boolean
}) {
  return (
    <div className="border-b border-border pb-3">
      <div className="flex items-baseline gap-4">
        <span
          className={`font-mono text-[11px] uppercase tracking-[0.2em] tabular-nums ${
            muted ? 'text-muted-foreground' : 'text-foreground'
          }`}
        >
          §&nbsp;{n}
        </span>
        <span
          className={`font-mono text-[11px] uppercase tracking-[0.2em] ${
            muted ? 'text-muted-foreground' : 'text-foreground'
          }`}
        >
          {title}
        </span>
        {hint ? (
          <span className="ml-auto hidden font-serif text-[12px] italic text-muted-foreground sm:inline">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Prose({
  n,
  title,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  n: string
  title: string
  hint?: string
  value: string
  onChange: (s: string) => void
  placeholder: string
  disabled?: boolean
}) {
  const chars = value.length
  return (
    <section>
      <SectionHeader n={n} title={title} hint={hint} />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={6}
        className="mt-5 w-full resize-y border-0 border-l-2 border-foreground/10 bg-transparent py-1 pl-5 font-serif text-[17px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/60"
      />
      <FieldMeta
        left={`${value.trim() ? wordCount(value.trim()) : 0} words`}
        right={`${chars} chars`}
      />
    </section>
  )
}

function FieldMeta({
  left,
  right,
  warn,
}: {
  left: string
  right: string
  warn?: boolean
}) {
  return (
    <div className="mt-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em]">
      <span className="text-muted-foreground">{left}</span>
      <span className={warn ? 'text-foreground' : 'text-muted-foreground'}>
        {right}
      </span>
    </div>
  )
}

function AuthorRow({
  address,
  role,
  onRemove,
}: {
  address: Address
  role: 'lead' | 'co-author'
  onRemove?: () => void
}) {
  const { data: name } = useIdentity(address)
  return (
    <li className="flex items-center justify-between gap-4 py-3">
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
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
        >
          Remove
        </button>
      ) : null}
    </li>
  )
}

function CommunityPicker({
  selfAddress,
  selected,
  onAdd,
}: {
  selfAddress: Address | undefined
  selected: Address[]
  onAdd: (a: Address) => void
}) {
  const { data: members, isLoading } = useAllMembers()
  const { data: subnames } = useClaimedSubnames()
  const [query, setQuery] = useState('')

  const selfLower = selfAddress?.toLowerCase()
  const selectedSet = useMemo(
    () => new Set(selected.map((a) => a.toLowerCase())),
    [selected],
  )

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = (members ?? [])
      .map((m) => m.owner as Address)
      .filter(
        (a) =>
          a.toLowerCase() !== selfLower && !selectedSet.has(a.toLowerCase()),
      )

    // Rows decorated with their resolvable ipecity name (if any) so the filter
    // and the default sort can both see it. ENS primary names need one RPC
    // per address, so we rely on PickerRow's useIdentity for that — the
    // subnames map covers community identities out of the box in one fetch.
    const rows = all.map((a) => ({
      address: a,
      name: subnames?.get(a.toLowerCase()),
    }))

    const matched = !q
      ? rows
      : rows.filter(
          (r) =>
            r.address.toLowerCase().includes(q) ||
            (r.name ? r.name.toLowerCase().includes(q) : false),
        )

    // Named members first — community identities should surface over raw hex.
    matched.sort((a, b) => {
      if (!!a.name === !!b.name) {
        return (a.name ?? a.address).localeCompare(b.name ?? b.address)
      }
      return a.name ? -1 : 1
    })

    return matched.slice(0, q ? 20 : 10).map((r) => r.address)
  }, [members, subnames, query, selfLower, selectedSet])

  return (
    <div className="border border-border">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Search
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="address or .ipecity.eth"
          className="flex-1 border-0 bg-transparent py-1 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/40"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground">
          {isLoading ? '…' : `${members?.length ?? 0} members`}
        </span>
      </div>
      {candidates.length === 0 ? (
        <div className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {isLoading ? 'Loading members…' : 'No matching members'}
        </div>
      ) : (
        <ul className="max-h-64 divide-y divide-border overflow-auto">
          {candidates.map((a) => (
            <PickerRow key={a} address={a} onAdd={() => onAdd(a)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PickerRow({
  address,
  onAdd,
}: {
  address: Address
  onAdd: () => void
}) {
  const { data: name } = useIdentity(address)
  return (
    <li className="flex items-center justify-between gap-4 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate font-serif text-[15px] text-foreground">
          {name ?? truncateAddress(address)}
        </div>
        {name ? (
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {truncateAddress(address)}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
      >
        + Add
      </button>
    </li>
  )
}

// ---------- helpers ----------

function sanitiseAmount(s: string) {
  // allow digits + single dot, strip everything else
  const cleaned = s.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) return cleaned
  return (
    cleaned.slice(0, firstDot + 1) +
    cleaned.slice(firstDot + 1).replace(/\./g, '')
  )
}

function formatAmount(n: number) {
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

function wordCount(s: string) {
  return s.split(/\s+/).filter(Boolean).length
}

function stepState(
  phase: Phase,
  step: Exclude<Phase, 'idle' | 'error'>,
): 'pending' | 'active' | 'done' | 'idle' {
  if (phase === 'idle' || phase === 'error') return 'idle'
  const order: Array<Exclude<Phase, 'idle' | 'error'>> = [
    'signing',
    'pinning',
    'submitting',
    'done',
  ]
  const cur = order.indexOf(phase)
  const me = order.indexOf(step)
  if (phase === 'done') return me <= cur ? 'done' : 'idle'
  if (me < cur) return 'done'
  if (me === cur) return 'active'
  return 'pending'
}


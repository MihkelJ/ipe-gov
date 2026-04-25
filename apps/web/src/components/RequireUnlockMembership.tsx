import { useConnectWallet, usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { ArrowUpRight, Check } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import {
  UNLOCK_CHECKOUT_URL,
  useUnlockMembership,
} from '#/hooks/useUnlockMembership'

type Stage = 'loading' | 'identity' | 'wallet' | 'checking' | 'key' | 'granted'

const EYEBROW =
  'font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground'

export default function RequireUnlockMembership({
  children,
}: {
  children: React.ReactNode
}) {
  const { ready, authenticated, login } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { address } = useAccount()
  const { isMember, isLoading } = useUnlockMembership(address)

  const stage: Stage = !ready
    ? 'loading'
    : !authenticated
      ? 'identity'
      : !address
        ? 'wallet'
        : isLoading
          ? 'checking'
          : !isMember
            ? 'key'
            : 'granted'

  if (stage === 'granted') return <>{children}</>

  return <Gate stage={stage} onLogin={login} onConnect={connectWallet} />
}

const STEPS = [
  {
    key: 'identity',
    label: 'Identity',
    detail: 'Sign in with email, social, or wallet',
  },
  {
    key: 'wallet',
    label: 'Wallet',
    detail: 'Connect the wallet holding your key',
  },
  {
    key: 'key',
    label: 'Membership key',
    detail: 'A valid Unlock key on Sepolia',
  },
] as const

function Gate({
  stage,
  onLogin,
  onConnect,
}: {
  stage: Exclude<Stage, 'granted'>
  onLogin: () => void
  onConnect: () => void
}) {
  const copy = stageCopy(stage)
  const stepIndex =
    stage === 'identity'
      ? 0
      : stage === 'wallet'
        ? 1
        : stage === 'checking' || stage === 'key'
          ? 2
          : -1

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      {/* Page header — same pattern as /members and /profile */}
      <header>
        <div className={EYEBROW}>§ Members only · Credentials check</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-prose text-sm text-muted-foreground sm:text-[15px]">
          {copy.body}
        </p>
      </header>

      {/* Ledger-style stepper — mirrors LedgerRow in /members */}
      <ol className="mt-8 divide-y divide-border border-y border-border">
        {STEPS.map((s, i) => {
          const status: StepStatus =
            stage === 'loading'
              ? 'pending'
              : i < stepIndex
                ? 'done'
                : i === stepIndex
                  ? stage === 'checking' && i === 2
                    ? 'checking'
                    : 'active'
                  : 'pending'
          return <StepRow key={s.key} index={i + 1} step={s} status={status} />
        })}
      </ol>

      {/* Action row */}
      <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ActionButton
          stage={stage}
          onLogin={onLogin}
          onConnect={onConnect}
          cta={copy.cta}
        />
        {stage === 'key' ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Opens Unlock in a new tab
          </span>
        ) : null}
      </div>

      {/* Footer meta — matches /members "Showing X of Y" treatment */}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]">
        <span>The Register · Sepolia</span>
        <a
          href="https://docs.ipe.city/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
        >
          What is this?
          <ArrowUpRight className="size-3" aria-hidden />
        </a>
      </div>
    </main>
  )
}

type StepStatus = 'done' | 'active' | 'checking' | 'pending'

function StepRow({
  index,
  step,
  status,
}: {
  index: number
  step: (typeof STEPS)[number]
  status: StepStatus
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 py-3 sm:gap-5 sm:py-4',
        status === 'pending' && 'opacity-55',
      )}
    >
      <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground sm:w-10 sm:text-sm">
        {String(index).padStart(2, '0')}
      </span>

      <span
        className={cn(
          'relative flex size-5 shrink-0 items-center justify-center rounded-full border',
          status === 'done' && 'border-foreground bg-foreground text-background',
          status === 'active' && 'border-foreground',
          status === 'checking' && 'border-foreground',
          status === 'pending' && 'border-border',
        )}
      >
        {status === 'done' ? (
          <Check className="size-3" aria-hidden />
        ) : status === 'checking' ? (
          <span className="size-1.5 animate-pulse rounded-full bg-foreground" />
        ) : status === 'active' ? (
          <span className="size-1.5 rounded-full bg-foreground" />
        ) : null}
      </span>

      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium sm:text-base">
            {step.label}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">
            {step.detail}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]',
            status === 'done' && 'text-foreground',
            status === 'active' && 'text-foreground',
          )}
        >
          {statusLabel(status)}
        </span>
      </div>
    </li>
  )
}

function ActionButton({
  stage,
  onLogin,
  onConnect,
  cta,
}: {
  stage: Exclude<Stage, 'granted'>
  onLogin: () => void
  onConnect: () => void
  cta: string
}) {
  if (stage === 'identity') {
    return (
      <Button size="lg" className="w-full sm:w-auto" onClick={onLogin}>
        Sign in to continue
      </Button>
    )
  }
  if (stage === 'wallet') {
    return (
      <Button size="lg" className="w-full sm:w-auto" onClick={onConnect}>
        Connect wallet
      </Button>
    )
  }
  if (stage === 'key') {
    return (
      <Button asChild size="lg" className="w-full sm:w-auto">
        <a href={UNLOCK_CHECKOUT_URL} target="_blank" rel="noreferrer">
          Get a membership key
          <ArrowUpRight className="ml-1 size-4" aria-hidden />
        </a>
      </Button>
    )
  }
  return (
    <Button size="lg" variant="secondary" disabled className="w-full sm:w-auto">
      <span
        aria-hidden
        className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-foreground"
      />
      {cta}
    </Button>
  )
}

function statusLabel(status: StepStatus) {
  switch (status) {
    case 'done':
      return 'Done'
    case 'active':
      return 'Now'
    case 'checking':
      return 'Checking'
    case 'pending':
      return 'Pending'
  }
}

function stageCopy(stage: Exclude<Stage, 'granted'>) {
  switch (stage) {
    case 'loading':
      return {
        title: 'Opening the register',
        body: 'Restoring your session — this usually takes a moment.',
        cta: 'Loading',
      }
    case 'identity':
      return {
        title: 'Members only',
        body: 'Sign in with email, a social account, or a wallet, then connect the wallet that holds your Ipê membership key.',
        cta: 'Sign in',
      }
    case 'wallet':
      return {
        title: 'Bring your key-holder',
        body: "You're signed in. Connect the wallet that holds your Ipê membership key to continue.",
        cta: 'Connect wallet',
      }
    case 'checking':
      return {
        title: 'Verifying your key',
        body: 'Reading the lock contract on Sepolia. Hold tight.',
        cta: 'Checking',
      }
    case 'key':
      return {
        title: 'No key on file',
        body: "This wallet doesn't hold a valid Ipê membership key. Mint one through Unlock to enter the members' wing.",
        cta: 'Get key',
      }
  }
}

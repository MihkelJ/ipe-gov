import { useState, type FormEvent } from 'react'
import { useConnectWallet, usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  UNLOCK_CHECKOUT_URL,
  useUnlockMembership,
} from '#/hooks/useUnlockMembership'
import { IPECITY_PARENT, useIpecityEns } from '#/hooks/useIpecityEns'

export default function RequireUnlockMembership({
  children,
}: {
  children: React.ReactNode
}) {
  const { ready, authenticated, login } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { address } = useAccount()
  const ens = useIpecityEns(address)
  const { isMember, isLoading } = useUnlockMembership(address)

  if (!ready) return <Gate>Loading…</Gate>

  if (!authenticated) {
    return (
      <Gate>
        <p className="mb-4 text-sm text-muted-foreground">
          Sign in with email, a social account, or a wallet — then connect the
          wallet that holds your{' '}
          <span className="font-mono">{IPECITY_PARENT}</span> subname.
        </p>
        <Button size="lg" onClick={login}>
          Sign in
        </Button>
      </Gate>
    )
  }

  if (!address) {
    return (
      <Gate>
        <p className="mb-4 text-sm text-muted-foreground">
          You're signed in. Connect the wallet that holds your{' '}
          <span className="font-mono">{IPECITY_PARENT}</span> subname to
          continue.
        </p>
        <Button size="lg" onClick={connectWallet}>
          Connect wallet
        </Button>
      </Gate>
    )
  }

  if (!ens.verifiedName) {
    return <EnsVerifyForm ens={ens} />
  }

  if (isLoading) return <Gate>Checking membership…</Gate>

  if (!isMember) {
    return (
      <Gate>
        <p className="mb-2 text-sm text-muted-foreground">
          Verified as{' '}
          <span className="font-mono">{ens.verifiedName}</span>.
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          Claim your membership key to continue.
        </p>
        <Button asChild size="lg">
          <a href={UNLOCK_CHECKOUT_URL} target="_blank" rel="noreferrer">
            Get membership
          </a>
        </Button>
      </Gate>
    )
  }

  return <>{children}</>
}

function EnsVerifyForm({ ens }: { ens: ReturnType<typeof useIpecityEns> }) {
  const [input, setInput] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (trimmed) ens.verify(trimmed)
  }

  const disabled = !input.trim() || ens.isChecking

  return (
    <Gate>
      <p className="mb-4 text-sm text-muted-foreground">
        Enter your <span className="font-mono">{IPECITY_PARENT}</span> subname
        to verify eligibility. Only holders can access the platform.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex items-stretch gap-0 rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <Input
            autoFocus
            placeholder="alice"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Your ipecity.eth subname"
            className="border-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
          <span className="flex shrink-0 items-center pr-3 font-mono text-sm text-muted-foreground">
            .{IPECITY_PARENT}
          </span>
        </div>
        <Button type="submit" size="lg" disabled={disabled}>
          {ens.isChecking ? 'Verifying…' : 'Verify'}
        </Button>
        {ens.rejected && (
          <p className="text-sm text-destructive">
            This subname isn't owned by your connected wallet.
          </p>
        )}
        {ens.error && <p className="text-sm text-destructive">{ens.error}</p>}
      </form>
    </Gate>
  )
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <div className="mb-6 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        Members only
      </div>
      {children}
    </main>
  )
}

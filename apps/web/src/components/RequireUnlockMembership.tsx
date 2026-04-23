import { useConnectWallet, usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { Button } from '#/components/ui/button'
import {
  UNLOCK_CHECKOUT_URL,
  useUnlockMembership,
} from '#/hooks/useUnlockMembership'

export default function RequireUnlockMembership({
  children,
}: {
  children: React.ReactNode
}) {
  const { ready, authenticated, login } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { address } = useAccount()
  const { isMember, isLoading } = useUnlockMembership(address)

  if (!ready) return <Gate>Loading…</Gate>

  if (!authenticated) {
    return (
      <Gate>
        <p className="mb-4 text-sm text-muted-foreground">
          Sign in with email, a social account, or a wallet — then connect the
          wallet that holds your membership key.
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
          You're signed in. Connect the wallet that holds your membership key
          to continue.
        </p>
        <Button size="lg" onClick={connectWallet}>
          Connect wallet
        </Button>
      </Gate>
    )
  }

  if (isLoading) return <Gate>Checking membership…</Gate>

  if (!isMember) {
    return (
      <Gate>
        <p className="mb-4 text-sm text-muted-foreground">
          This wallet doesn't hold a valid membership key.
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

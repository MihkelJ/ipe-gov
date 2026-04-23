import { useConnectWallet, usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { Button } from '#/components/ui/button'
import { IPECITY_SUFFIX, useEnsMembership } from '#/hooks/useEnsMembership'

export default function RequireEnsMembership({
  children,
}: {
  children: React.ReactNode
}) {
  const { ready, authenticated, login } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { address } = useAccount()
  const { data, isLoading } = useEnsMembership(address)

  if (!ready) return <Gate>Loading…</Gate>

  if (!authenticated) {
    return (
      <Gate>
        <p className="mb-4 text-sm text-muted-foreground">
          Sign in with email, a social account, or a wallet — then connect the
          wallet that owns your {IPECITY_SUFFIX} subdomain.
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
          {IPECITY_SUFFIX} subdomain to continue.
        </p>
        <Button size="lg" onClick={connectWallet}>
          Connect wallet
        </Button>
      </Gate>
    )
  }

  if (isLoading) return <Gate>Checking {IPECITY_SUFFIX} ownership…</Gate>

  if (!data?.isMember) {
    return (
      <Gate>
        <p className="mb-2 text-sm text-muted-foreground">
          This wallet has no {IPECITY_SUFFIX} subdomain set as its ENS primary
          name.
        </p>
        <p className="text-xs text-muted-foreground">
          Get a {IPECITY_SUFFIX} subdomain, then set it as your primary name at{' '}
          <a
            href="https://app.ens.domains/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            app.ens.domains
          </a>
          .
        </p>
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

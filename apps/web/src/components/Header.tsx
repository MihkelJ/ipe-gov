import { Link } from '@tanstack/react-router'
import { useConnectWallet, usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { Button } from '#/components/ui/button'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { address } = useAccount()

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          ipe-gov
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/proposals"
            className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            activeProps={{ className: 'text-foreground' }}
          >
            Proposals
          </Link>
          <Link
            to="/members"
            className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            activeProps={{ className: 'text-foreground' }}
          >
            Members
          </Link>
          {!ready ? null : !authenticated ? (
            <Button size="sm" onClick={login}>
              Sign in
            </Button>
          ) : (
            <>
              {!address ? (
                <Button variant="outline" size="sm" onClick={connectWallet}>
                  Connect wallet
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={logout}>
                <span className="font-mono">{identity(address, user)}</span>
                <span className="ml-2 text-muted-foreground">Sign out</span>
              </Button>
            </>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}

function identity(
  address: string | undefined,
  user: ReturnType<typeof usePrivy>['user'],
) {
  if (address) return `${address.slice(0, 6)}…${address.slice(-4)}`
  const email = user?.email?.address
  if (email) return email
  return 'Signed in'
}

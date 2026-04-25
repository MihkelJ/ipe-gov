import { Link } from '@tanstack/react-router'
import { useConnectWallet, usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { Button } from '#/components/ui/button'
import { useIdentity } from '#/hooks/useIdentity'
import { truncateAddress } from '#/lib/address'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  const { ready, authenticated, login, logout } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { address } = useAccount()
  const { data: displayName } = useIdentity(address)
  const label = displayName ?? (address ? truncateAddress(address) : 'Signed in')

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
          {authenticated ? (
            <Link
              to="/profile"
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
              activeProps={{ className: 'text-foreground' }}
            >
              Your name
            </Link>
          ) : null}
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
                <span className={displayName ? '' : 'font-mono'}>{label}</span>
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

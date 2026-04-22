import { Link } from '@tanstack/react-router'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import ThemeToggle from './ThemeToggle'

export default function Header() {
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
          <ConnectButton chainStatus="icon" showBalance={false} />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}

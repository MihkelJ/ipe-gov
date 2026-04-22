import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Confidential DAO governance
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
        Unlock-Protocol-gated voting where individual ballots stay encrypted
        on-chain and only the aggregate tally is revealed.
      </p>
      <div className="mt-8">
        <Button asChild size="lg">
          <Link to="/proposals">View proposals</Link>
        </Button>
      </div>
    </main>
  )
}

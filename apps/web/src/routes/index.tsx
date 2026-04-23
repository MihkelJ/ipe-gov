import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import ClaimPassport from '#/components/ClaimPassport'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-20 text-center">
      <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        Ipê Village · Parallel Institutions
      </div>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Confidential governance for the pop-up city
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
        Residents of Ipê propose and decide together. Ballots are encrypted
        on-chain with FHE — only the aggregate tally is revealed. Architects
        carry voting rights; Explorers come to learn and connect.
      </p>
      <p className="mx-auto mt-3 max-w-xl text-balance text-sm text-muted-foreground">
        New here?{' '}
        <a
          href="https://docs.ipe.city/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Read the docs
        </a>
        .
      </p>
      <div className="mt-8 flex flex-col items-center gap-4">
        <Button asChild size="lg">
          <Link to="/proposals">View proposals</Link>
        </Button>
        <ClaimPassport />
      </div>
    </main>
  )
}

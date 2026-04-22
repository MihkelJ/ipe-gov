import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { GOVERNOR_ABI, GOVERNOR_ADDRESS } from '../lib/governor'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'

export const Route = createFileRoute('/proposals/')({
  head: () => ({ meta: [{ title: 'Proposals — ipe-gov' }] }),
  component: Proposals,
})

function Proposals() {
  const { isConnected } = useAccount()
  const { data: count } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: GOVERNOR_ABI,
    functionName: 'proposalCount',
  })
  const total = count ? Number(count) : 0
  const ids = Array.from({ length: total }, (_, i) => total - i)

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Proposals</h1>

      {isConnected ? <NewProposalCard /> : null}

      <section className="mt-8 space-y-3">
        {ids.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No proposals yet.
            </CardContent>
          </Card>
        ) : (
          ids.map((id) => (
            <Link
              key={id}
              to="/proposals/$proposalId"
              params={{ proposalId: String(id) }}
              className="block"
            >
              <Card className="transition hover:border-primary/50 hover:bg-accent/40">
                <CardHeader>
                  <CardTitle>Proposal #{id}</CardTitle>
                  <CardDescription>Click to view and vote.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))
        )}
      </section>
    </main>
  )
}

function NewProposalCard() {
  const [description, setDescription] = useState('')
  const { writeContract, isPending } = useWriteContract()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    writeContract({
      address: GOVERNOR_ADDRESS,
      abi: GOVERNOR_ABI,
      functionName: 'propose',
      args: [description],
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New proposal</CardTitle>
        <CardDescription>
          Only holders of a valid Unlock Protocol key can propose.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex gap-2">
          <Input
            placeholder="What should the DAO decide?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button type="submit" disabled={isPending || !description.trim()}>
            {isPending ? 'Submitting…' : 'Propose'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

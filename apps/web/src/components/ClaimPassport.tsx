import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { zeroAddress, type Hex } from 'viem'
import { PublicLockABI, addresses } from '@ipe-gov/sdk'
import { Button } from '#/components/ui/button'
import { useIsMember } from '#/hooks/useDelegation'
import { useSponsoredWrite } from '#/hooks/useSponsoredWrite'

export default function ClaimPassport() {
  const { address, isConnected } = useAccount()
  const { data: hasKey, refetch: refetchKey, isLoading: isCheckingKey } = useIsMember(address)

  const { mutateAsync: sponsoredWrite, isPending, error } = useSponsoredWrite()
  const [done, setDone] = useState(false)

  async function claim() {
    if (!address) return
    setDone(false)
    // keyPrice must be 0 for this path — the paymaster only sponsors gas,
    // not ETH value on the inner call.
    await sponsoredWrite({
      address: addresses.sepolia.lock as Hex,
      abi: PublicLockABI,
      functionName: 'purchase',
      args: [[0n], [address], [zeroAddress], [zeroAddress], ['0x']],
    })
    setDone(true)
    await refetchKey()
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-3">
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <Button size="lg" variant="outline" onClick={openConnectModal}>
              Connect wallet to claim Architect Passport
            </Button>
          )}
        </ConnectButton.Custom>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Free · gas sponsored during Ipê Village bootstrap
        </p>
      </div>
    )
  }

  if (isCheckingKey) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Checking passport…
      </p>
    )
  }

  if (hasKey) {
    return (
      <div className="inline-flex items-center gap-2 border border-foreground/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em]">
        <span aria-hidden>●</span> Passport active
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button size="lg" variant="outline" onClick={claim} disabled={isPending}>
        {isPending ? 'Minting passport…' : 'Claim Architect Passport'}
      </Button>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Free · gas sponsored
      </p>
      {done ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
          Passport minted
        </p>
      ) : null}
      {error ? (
        <p className="font-mono text-[11px] text-destructive">{error.message}</p>
      ) : null}
    </div>
  )
}

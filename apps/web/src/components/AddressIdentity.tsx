import type { Address } from 'viem'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { useIdentity } from '#/hooks/useIdentity'
import { truncateAddress } from '#/lib/address'

type Size = 'sm' | 'default' | 'lg'

type AddressIdentityProps = {
  address: Address
  size?: Size
  className?: string
}

/** Renders letter-fallback avatar + label for an address. Label precedence:
 *  1. `*.ipecity.eth` wrapped subname (via ENS subgraph)
 *  2. ENS primary name (reverse resolution)
 *  3. Truncated hex address */
export function AddressIdentity({
  address,
  size = 'sm',
  className,
}: AddressIdentityProps) {
  const { data: name } = useIdentity(address)
  const label = name ?? truncateAddress(address)
  // Two chars: first two of the name, or the two-hex byte before the address suffix.
  const fallback = name
    ? name.slice(0, 2).toUpperCase()
    : address.slice(-4, -2).toUpperCase()

  return (
    <div className={`flex items-center gap-3${className ? ` ${className}` : ''}`}>
      <Avatar size={size}>
        <AvatarFallback className="font-mono text-[10px] uppercase tracking-wider">
          {fallback}
        </AvatarFallback>
      </Avatar>
      <span className={name ? 'text-sm' : 'font-mono text-sm'}>{label}</span>
    </div>
  )
}

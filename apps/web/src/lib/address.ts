import type { Hex } from 'viem'

export function truncateAddress(addr: Hex): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

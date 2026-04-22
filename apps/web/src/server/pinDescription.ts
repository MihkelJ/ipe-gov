import { createServerFn } from '@tanstack/react-start'
import { createPublicClient, http, verifyMessage, type Hex } from 'viem'
import { sepolia } from 'viem/chains'
import { pinProposalDescription } from '@ipe-gov/ipfs'
import { MockPublicLockABI, addresses } from '@ipe-gov/sdk'

type PinInput = {
  text: string
  address: Hex
  signature: Hex
  message: string
}

/** Builds the exact message the client should sign. Both sides use this. */
export function buildPinMessage(address: Hex, timestampMs: number): string {
  return [
    'ipe-gov: pin proposal description',
    `address: ${address}`,
    `timestamp: ${new Date(timestampMs).toISOString()}`,
  ].join('\n')
}

function parseTimestamp(message: string): number {
  const line = message.split('\n').find((l) => l.startsWith('timestamp: '))
  if (!line) throw new Error('invalid message: missing timestamp line')
  const iso = line.slice('timestamp: '.length)
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error('invalid timestamp')
  return ms
}

/**
 * Pins a proposal description to IPFS on behalf of a verified Unlock member.
 * Contract-enforced membership + signature verification keep this endpoint
 * from being a free pinning service for anyone on the internet.
 */
export const pinDescription = createServerFn({ method: 'POST' })
  .inputValidator((data: PinInput) => {
    if (!data.text?.trim()) throw new Error('text is required')
    if (!/^0x[a-fA-F0-9]{40}$/.test(data.address)) throw new Error('invalid address')
    if (!data.signature?.startsWith('0x')) throw new Error('invalid signature')
    if (!data.message) throw new Error('message is required')
    return data
  })
  .handler(async ({ data }) => {
    // 1. Signature must come from the claimed address over the exact message.
    const valid = await verifyMessage({
      address: data.address,
      message: data.message,
      signature: data.signature,
    })
    if (!valid) throw new Error('signature does not match address')

    // 2. Reject messages older than 10 minutes to limit replay.
    const ts = parseTimestamp(data.message)
    if (Math.abs(Date.now() - ts) > 10 * 60 * 1000) {
      throw new Error('signed message is too old or too new')
    }

    // 3. Claimed address must hold a valid Unlock key.
    const rpcUrl =
      process.env.SEPOLIA_RPC_URL ??
      (process.env.INFURA_API_KEY
        ? `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`
        : null)
    if (!rpcUrl) throw new Error('server missing SEPOLIA_RPC_URL or INFURA_API_KEY')

    const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) })
    const hasKey = await client.readContract({
      address: addresses.sepolia.lock as Hex,
      abi: MockPublicLockABI,
      functionName: 'getHasValidKey',
      args: [data.address],
    })
    if (!hasKey) throw new Error('address does not hold a valid membership key')

    // 4. Pin to IPFS via Pinata.
    const jwt = process.env.PINATA_JWT
    if (!jwt) throw new Error('server missing PINATA_JWT')

    const { cid } = await pinProposalDescription({
      jwt,
      text: data.text.trim(),
      proposer: data.address,
    })
    return { cid }
  })

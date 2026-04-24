import { keccak256, toBytes, type Hex } from 'viem'
import { canonicalJson, type ProposalBody } from '@ipe-gov/ipfs'

// Client for the @ipe-gov/pin-api Cloudflare Worker.

const PIN_API_URL = import.meta.env.VITE_PIN_API_URL as string | undefined

type PinInput = {
  text: string
  address: Hex
  signature: Hex
  message: string
  body?: ProposalBody
}

/** Hash a structured proposal body deterministically so a signature can
 *  bind to exactly what the pin-api forwards to Pinata. */
export function hashBody(body: ProposalBody): Hex {
  return keccak256(toBytes(canonicalJson(body)))
}

/** Builds the exact message the client should sign. Mirrors the Worker.
 *  `bodyHash` MUST be included when a structured body is being pinned —
 *  the Worker rejects v2 submissions without a matching `body-hash` line. */
export function buildPinMessage(
  address: Hex,
  timestampMs: number,
  bodyHash?: Hex,
): string {
  const lines = [
    'ipe-gov: pin proposal description',
    `address: ${address}`,
    `timestamp: ${new Date(timestampMs).toISOString()}`,
  ]
  if (bodyHash) lines.push(`body-hash: ${bodyHash}`)
  return lines.join('\n')
}

export async function pinDescription({
  data,
}: {
  data: PinInput
}): Promise<{ cid: string }> {
  if (!PIN_API_URL) {
    throw new Error('VITE_PIN_API_URL is not configured')
  }

  const res = await fetch(`${PIN_API_URL}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    let detail: string
    try {
      const body = (await res.json()) as { error?: string }
      detail = body.error ?? res.statusText
    } catch {
      detail = res.statusText
    }
    throw new Error(`pin-api ${res.status}: ${detail}`)
  }
  return (await res.json()) as { cid: string }
}

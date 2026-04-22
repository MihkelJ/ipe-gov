import type { Hex } from 'viem'

/**
 * Client shim for the @ipe-gov/pin-api Cloudflare Worker. Kept at this path so
 * the existing call site (createServerFn-style `pinDescription({ data })`) does
 * not need to change — only the implementation did.
 */

const PIN_API_URL = import.meta.env.VITE_PIN_API_URL as string | undefined

type PinInput = {
  text: string
  address: Hex
  signature: Hex
  message: string
}

/** Builds the exact message the client should sign. Mirrors the Worker. */
export function buildPinMessage(address: Hex, timestampMs: number): string {
  return [
    'ipe-gov: pin proposal description',
    `address: ${address}`,
    `timestamp: ${new Date(timestampMs).toISOString()}`,
  ].join('\n')
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

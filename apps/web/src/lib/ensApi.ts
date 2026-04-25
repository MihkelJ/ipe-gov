import type { Address, Hex } from 'viem'

/**
 * Thin client for `apps/ens-api`. Mirrors the request/response shapes that
 * the worker's Zod schemas enforce — if those change, this file and the
 * corresponding schemas must move together.
 */

// Re-export so route + hook code keeps importing from one path while the
// builder itself lives in @ipe-gov/sdk (single source of truth shared with
// the worker's verification side).
export { buildClaimMessage } from '@ipe-gov/sdk'

const ENS_API_URL = import.meta.env.VITE_ENS_API_URL as string | undefined

function requireBaseUrl(): string {
  if (!ENS_API_URL) throw new Error('VITE_ENS_API_URL is not set')
  return ENS_API_URL
}

export type AvailabilityResponse =
  | { available: true; label: string }
  | { available: false; label?: string; reason?: string }
  | { available: false; error: string }

export async function fetchAvailability(
  label: string,
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const url = `${requireBaseUrl()}/ens/available?label=${encodeURIComponent(label)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`availability check failed: ${res.status}`)
  return (await res.json()) as AvailabilityResponse
}

export type ClaimResponse = {
  ok: true
  address: Address
  label: string
  node: Hex
  fullName: string
  txHash: Hex
  mintedAt: string
}

export async function postClaim(params: {
  label: string
  recipient: Address
  signature: Hex
  message: string
}): Promise<ClaimResponse> {
  const res = await fetch(`${requireBaseUrl()}/ens/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `claim failed: ${res.status}`)
  }
  return (await res.json()) as ClaimResponse
}

export type SubnameIdentity = {
  address: Address
  label: string
  fullName: string
  node: Hex
}

export async function fetchSubnameIdentity(
  address: Address,
  signal?: AbortSignal,
): Promise<SubnameIdentity | null> {
  const res = await fetch(`${requireBaseUrl()}/ens/identity/${address}`, { signal })
  if (!res.ok) throw new Error(`identity fetch failed: ${res.status}`)
  const json = (await res.json()) as { identity: SubnameIdentity | null }
  return json.identity
}

export async function fetchAllSubnameIdentities(
  signal?: AbortSignal,
): Promise<SubnameIdentity[]> {
  const res = await fetch(`${requireBaseUrl()}/ens/identities`, { signal })
  if (!res.ok) throw new Error(`identities fetch failed: ${res.status}`)
  const json = (await res.json()) as { identities: SubnameIdentity[] }
  return json.identities
}

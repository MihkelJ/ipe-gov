import type { Address, Hex } from "viem";

/**
 * Shared message envelopes + parsing primitives used by both web (signing
 * side) and workers (verification side). Keeping these in one place is the
 * only way to guarantee the bytes the user signs are the bytes the worker
 * recovers — historically every worker had its own builder, which drifted.
 */

/** A signed message is rejected if its `timestamp` line is more than ten
 *  minutes from `Date.now()`. This window covers wallet-prompt latency on
 *  slow connections without giving a stolen sig much practical replay
 *  surface. */
export const SIGNED_MESSAGE_MAX_AGE_MS = 10 * 60 * 1000;

/** Default JSON request body cap for our workers (8 KiB). Pin-api's image
 *  upload uses a separate, larger constant for binary payloads. */
export const MAX_REQUEST_BYTES = 8 * 1024;

/** ENS subname label shape rule. Must match what the registrar accepts: a-z,
 *  0-9, hyphens, no leading/trailing hyphen. Single regex shared between
 *  client validation and worker rejection. */
export const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const MIN_LABEL_LEN = 3;
export const MAX_LABEL_LEN = 32;

/** Builds the message format for an ENS subname claim request. The web
 *  client signs this; ens-api re-derives the same string (via this same
 *  function) and verifies the signature against the recipient. Field order
 *  and prefixes are part of the contract — don't reorder. */
export function buildClaimMessage(params: {
  intent: string;
  recipient: Address;
  label: string;
  timestampMs: number;
}): string {
  return [
    `ipe-gov: ${params.intent}`,
    `recipient: ${params.recipient}`,
    `label: ${params.label}`,
    `timestamp: ${new Date(params.timestampMs).toISOString()}`,
  ].join("\n");
}

/** Pin-api's proposal-pin message. `bodyHash` binds a structured body to the
 *  signature so a relay can't strip the body and pin a degraded envelope.
 *  Optional because legacy v1 pins (text-only) didn't include it. */
export function buildPinMessage(
  address: Hex,
  timestampMs: number,
  bodyHash?: Hex,
): string {
  const lines = [
    "ipe-gov: pin proposal description",
    `address: ${address}`,
    `timestamp: ${new Date(timestampMs).toISOString()}`,
  ];
  if (bodyHash) lines.push(`body-hash: ${bodyHash}`);
  return lines.join("\n");
}

/** Pin-api's avatar-image message. No body-hash — TLS handles in-transit
 *  integrity for the image bytes, and membership-gating fences off
 *  anonymous uploaders. */
export function buildPinImageMessage(address: Hex, timestampMs: number): string {
  return [
    "ipe-gov: pin avatar image",
    `address: ${address}`,
    `timestamp: ${new Date(timestampMs).toISOString()}`,
  ].join("\n");
}

/** Pulls a `prefix: value` line out of one of our signed messages.
 *  Returns the trimmed value, or `null` when the line is absent. */
export function extractField(message: string, prefix: string): string | null {
  const line = message.split("\n").find((l) => l.startsWith(prefix));
  return line ? line.slice(prefix.length) : null;
}

/** Parses the `timestamp:` ISO line into ms-since-epoch. Returns `null`
 *  when the line is missing or unparseable so the caller can decide how to
 *  surface the error (worker → 400, web → user-friendly). */
export function parseSignedTimestamp(message: string): number | null {
  const v = extractField(message, "timestamp: ");
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

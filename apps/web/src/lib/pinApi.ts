import { keccak256, toBytes, type Hex } from "viem";
import { canonicalJson, type ProposalBody } from "@ipe-gov/ipfs";

// Client for the @ipe-gov/pin-api Cloudflare Worker.

// Re-exports so existing callers keep importing from one place while the
// message builders themselves live in @ipe-gov/sdk (single source of truth
// shared with the Worker's verification side).
export { buildPinMessage, buildPinImageMessage } from "@ipe-gov/sdk";

const PIN_API_URL = import.meta.env.VITE_PIN_API_URL as string | undefined;

type PinInput = {
  text: string;
  address: Hex;
  signature: Hex;
  message: string;
  body?: ProposalBody;
};

/** Hash a structured proposal body deterministically so a signature can
 *  bind to exactly what the pin-api forwards to Pinata. */
export function hashBody(body: ProposalBody): Hex {
  return keccak256(toBytes(canonicalJson(body)));
}

export async function pinDescription({ data }: { data: PinInput }): Promise<{ cid: string }> {
  if (!PIN_API_URL) {
    throw new Error("VITE_PIN_API_URL is not configured");
  }

  const res = await fetch(`${PIN_API_URL}/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let detail: string;
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? res.statusText;
    } catch {
      detail = res.statusText;
    }
    throw new Error(`pin-api ${res.status}: ${detail}`);
  }
  return (await res.json()) as { cid: string };
}

/** Pin an avatar image through pin-api. The Worker re-checks Unlock
 *  membership before forwarding to Pinata, so this is the same gate as
 *  proposal pinning. Returns the resulting `ipfs://<cid>` URI ready for
 *  storage as an ENSIP-18 avatar text record. */
export async function pinImage(params: {
  file: File;
  address: Hex;
  signature: Hex;
  message: string;
}): Promise<{ cid: string; uri: string }> {
  if (!PIN_API_URL) {
    throw new Error("VITE_PIN_API_URL is not configured");
  }

  const form = new FormData();
  form.append("file", params.file);
  form.append("address", params.address);
  form.append("signature", params.signature);
  form.append("message", params.message);

  const res = await fetch(`${PIN_API_URL}/pin-image`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let detail: string;
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? res.statusText;
    } catch {
      detail = res.statusText;
    }
    throw new Error(`pin-api ${res.status}: ${detail}`);
  }
  return (await res.json()) as { cid: string; uri: string };
}

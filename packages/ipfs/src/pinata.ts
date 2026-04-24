import type { ProposalBody } from "./proposal-body";

const PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

export type PinataError = { error: string; status: number };

/**
 * Pins a proposal description (JSON payload) to IPFS via Pinata and returns
 * the resulting CID.
 *
 * A structured `body` may be attached; when present the envelope is v2. The
 * top-level `text` is retained as a short summary so list views and v1-only
 * readers keep working.
 */
export async function pinProposalDescription(params: {
  jwt: string;
  text: string;
  proposer: `0x${string}`;
  body?: ProposalBody;
}): Promise<{ cid: string }> {
  const body = {
    pinataContent: {
      version: params.body ? 2 : 1,
      kind: "ipe-gov.proposal-description",
      text: params.text,
      proposer: params.proposer,
      createdAt: new Date().toISOString(),
      ...(params.body ? { body: params.body } : {}),
    },
    pinataMetadata: {
      name: `proposal-description-${params.proposer}-${Date.now()}`,
    },
  };

  const response = await fetch(PINATA_PIN_JSON_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Pinata pin failed (${response.status}): ${detail}`);
  }

  const json = (await response.json()) as { IpfsHash: string };
  return { cid: json.IpfsHash };
}

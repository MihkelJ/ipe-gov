export const DEFAULT_GATEWAY = "https://dweb.link";

/** Returns a public gateway URL for a CID. */
export function ipfsGatewayUrl(cid: string, gateway = DEFAULT_GATEWAY): string {
  const base = gateway.replace(/\/$/, "");
  return `${base}/ipfs/${cid}`;
}

import type { ProposalBody } from "./proposal-body";

export type ProposalDescriptionPayload = {
  version: number;
  kind: "ipe-gov.proposal-description";
  text: string;
  proposer: `0x${string}`;
  createdAt: string;
  body?: ProposalBody;
};

/** Fetches a pinned proposal description JSON envelope from an IPFS gateway. */
export async function fetchProposalDescription(
  cid: string,
  gateway?: string,
): Promise<ProposalDescriptionPayload> {
  const res = await fetch(ipfsGatewayUrl(cid, gateway));
  if (!res.ok) {
    throw new Error(`IPFS gateway returned ${res.status} for ${cid}`);
  }
  const payload = (await res.json()) as ProposalDescriptionPayload;
  if (payload.kind !== "ipe-gov.proposal-description") {
    throw new Error(`Unexpected IPFS payload kind: ${payload.kind}`);
  }
  if (payload.body && payload.body.schema !== "ipe-gov.proposal-body/1") {
    // Unknown body schema — drop it so consumers fall back to `text`.
    return { ...payload, body: undefined };
  }
  return payload;
}

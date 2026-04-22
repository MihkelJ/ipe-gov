export const DEFAULT_GATEWAY = "https://dweb.link";

/** Returns a public gateway URL for a CID. */
export function ipfsGatewayUrl(cid: string, gateway = DEFAULT_GATEWAY): string {
  const base = gateway.replace(/\/$/, "");
  return `${base}/ipfs/${cid}`;
}

export type ProposalDescriptionPayload = {
  version: number;
  kind: "ipe-gov.proposal-description";
  text: string;
  proposer: `0x${string}`;
  createdAt: string;
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
  return payload;
}

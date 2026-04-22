const PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

export type PinataError = { error: string; status: number };

/**
 * Pins a proposal description (JSON payload) to IPFS via Pinata and returns
 * the resulting CID.
 *
 * We wrap the text in a small JSON envelope so we can attach metadata (version,
 * createdAt) without another on-chain field.
 */
export async function pinProposalDescription(params: {
  jwt: string;
  text: string;
  proposer: `0x${string}`;
}): Promise<{ cid: string }> {
  const body = {
    pinataContent: {
      version: 1,
      kind: "ipe-gov.proposal-description",
      text: params.text,
      proposer: params.proposer,
      createdAt: new Date().toISOString(),
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

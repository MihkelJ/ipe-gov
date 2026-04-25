import {
  SIGNED_MESSAGE_MAX_AGE_MS,
  parseSignedTimestamp,
} from "@ipe-gov/sdk";
import { type Address, type Hex, verifyMessage } from "viem";
import { HttpError } from "./error";

/** Verifies the parts of a signed message that are identical across every
 *  endpoint we have:
 *   1. the signature recovers to `recipient`
 *   2. line one is `ipe-gov: <expectedIntent>`
 *   3. the `timestamp:` line is within `SIGNED_MESSAGE_MAX_AGE_MS` of now
 *
 *  Cross-checks of body-specific fields (label, body-hash, etc.) stay in
 *  the calling endpoint — they vary by message type. Throws `HttpError`. */
export async function verifySignedMessage(params: {
  recipient: Address;
  message: string;
  signature: Hex;
  expectedIntent: string;
}): Promise<void> {
  const sigOk = await verifyMessage({
    address: params.recipient,
    message: params.message,
    signature: params.signature,
  });
  if (!sigOk) throw new HttpError(401, "signature does not match recipient");

  const firstLine = params.message.split("\n", 1)[0] ?? "";
  const intent = firstLine.replace(/^ipe-gov:\s*/, "");
  if (intent !== params.expectedIntent) {
    throw new HttpError(400, `signed message is not for "${params.expectedIntent}"`);
  }

  const ts = parseSignedTimestamp(params.message);
  if (ts === null) throw new HttpError(400, "missing or invalid timestamp");
  if (Math.abs(Date.now() - ts) > SIGNED_MESSAGE_MAX_AGE_MS) {
    throw new HttpError(401, "signed message is too old or too new");
  }
}

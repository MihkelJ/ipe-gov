import { Hono } from "hono";
import { isAddress, isHash, isHex, keccak256, toBytes, type Hex } from "viem";
import { z } from "zod";
import { ProposalBodySchema, canonicalJson, pinFile, pinProposalDescription } from "@ipe-gov/ipfs";
import { extractField } from "@ipe-gov/sdk";
import {
  HttpError,
  applyCors,
  assertSepoliaUnlockMember,
  errorResponse,
  readJsonBody,
  verifySignedMessage,
} from "@ipe-gov/workers-shared";

type Env = {
  PINATA_JWT: string;
  ALLOWED_ORIGINS?: string;
};

const PinRequestSchema = z.object({
  text: z.string().min(1).max(8_000),
  address: z.custom<`0x${string}`>((v) => typeof v === "string" && isAddress(v, { strict: false }), "invalid address"),
  signature: z.custom<`0x${string}`>((v) => isHex(v), "invalid signature"),
  message: z.string().min(1),
  body: ProposalBodySchema.optional(),
});

const MAX_PIN_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const app = new Hono<{ Bindings: Env }>();

applyCors(app, { allowMethods: ["POST", "OPTIONS"] });

app.get("/", (c) => c.text("ipe-gov pin-api"));

app.post("/pin", async (c) => {
  try {
    const body = await readJsonBody(c.req.raw, PinRequestSchema, {
      maxBytes: MAX_PIN_BYTES,
    });

    await verifySignedMessage({
      recipient: body.address,
      message: body.message,
      signature: body.signature,
      expectedIntent: "pin proposal description",
    });

    // A structured body is bound to the signature via a `body-hash` line in
    // the signed message. Reject in either direction: a body present without
    // a committed hash (so an attacker can't attach arbitrary content to a
    // legacy-shaped signature), or a committed hash without a body (so a
    // relay can't strip the body and pin a degraded v1 envelope).
    const claimedHash = parseBodyHash(body.message);
    if (body.body !== undefined) {
      if (!claimedHash) {
        throw new HttpError(401, "signed message is missing body-hash");
      }
      const computed = keccak256(toBytes(canonicalJson(body.body)));
      if (claimedHash.toLowerCase() !== computed.toLowerCase()) {
        throw new HttpError(401, "body-hash does not match signed body");
      }
    } else if (claimedHash) {
      throw new HttpError(400, "signed message commits to a body-hash but no body was sent");
    }

    await assertSepoliaUnlockMember(body.address);

    if (!c.env.PINATA_JWT) throw new HttpError(500, "server missing PINATA_JWT");

    try {
      const { cid } = await pinProposalDescription({
        jwt: c.env.PINATA_JWT,
        text: body.text.trim(),
        proposer: body.address,
        body: body.body,
      });
      return c.json({ cid });
    } catch (err) {
      throw new HttpError(502, (err as Error).message);
    }
  } catch (err) {
    return errorResponse(c, err);
  }
});

/**
 * Pin an avatar image to IPFS. Multipart form with fields:
 *   file       — the image (≤ 2 MiB, image/png|jpeg|webp|gif)
 *   address    — claiming wallet
 *   signature  — personal_sign over `message`
 *   message    — `buildPinImageMessage(address, ts)`
 *
 * Verification mirrors `/pin`: signature recovers to the address, message is
 * < 10 minutes old, address holds an Unlock key on Sepolia. The file itself
 * isn't bound to the signature (TLS handles in-transit integrity); the gate
 * is just "are you a member who recently asked to upload an avatar".
 */
app.post("/pin-image", async (c) => {
  try {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      throw new HttpError(400, "expected multipart/form-data");
    }

    const file = form.get("file");
    const address = form.get("address");
    const signature = form.get("signature");
    // Browsers normalize `\n` to `\r\n` when serializing multipart text fields
    // (HTML living standard), but the client signed the `\n` version. Strip
    // the carriage returns so verifyMessage compares against the same bytes
    // the wallet signed.
    const messageRaw = form.get("message");
    const message = typeof messageRaw === "string" ? messageRaw.replace(/\r\n/g, "\n") : messageRaw;

    // FormData.get returns Blob | string | null in workers-types. Workers'
    // value-side `File` isn't exposed through the type defs, so narrow with
    // typeof checks + treat the entry as a Blob (which has size + type).
    // We layer a `name` field on top via a structural cast since Pinata's
    // multipart envelope wants a filename.
    if (file === null || typeof file === "string") {
      throw new HttpError(400, "file is required");
    }
    const blob = file as Blob & { name?: string };
    if (typeof address !== "string" || !isAddress(address)) {
      throw new HttpError(400, "valid address is required");
    }
    if (typeof signature !== "string" || !isHex(signature)) {
      throw new HttpError(400, "valid signature is required");
    }
    if (typeof message !== "string" || message.length === 0) {
      throw new HttpError(400, "message is required");
    }

    if (blob.size > MAX_IMAGE_BYTES) {
      throw new HttpError(413, "image exceeds 2 MiB limit");
    }
    if (!ALLOWED_IMAGE_TYPES.has(blob.type)) {
      throw new HttpError(415, `unsupported image type: ${blob.type}`);
    }

    await verifySignedMessage({
      recipient: address as Hex,
      message,
      signature: signature as Hex,
      expectedIntent: "pin avatar image",
    });

    await assertSepoliaUnlockMember(address as Hex);

    if (!c.env.PINATA_JWT) throw new HttpError(500, "server missing PINATA_JWT");

    // Recover the timestamp purely for the pin-name suffix (so duplicate
    // uploads for the same address sort by time in Pinata's dashboard).
    // The freshness check itself already happened in verifySignedMessage.
    const ts = extractField(message, "timestamp: ");

    try {
      const { cid } = await pinFile({
        jwt: c.env.PINATA_JWT,
        file: blob,
        fileName: blob.name || "avatar",
        pinName: `avatar-${address}-${ts ?? Date.now()}`,
      });
      return c.json({ cid, uri: `ipfs://${cid}` });
    } catch (err) {
      throw new HttpError(502, (err as Error).message);
    }
  } catch (err) {
    return errorResponse(c, err);
  }
});

/** Pulls the optional `body-hash:` line out of a signed pin message and
 *  validates it as a 32-byte hex hash. Returns `null` when absent. */
function parseBodyHash(message: string): Hex | null {
  const v = extractField(message, "body-hash: ");
  if (!v) return null;
  return isHash(v) ? (v as Hex) : null;
}

export default app;

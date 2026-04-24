import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createPublicClient,
  http,
  isAddress,
  isHash,
  isHex,
  keccak256,
  toBytes,
  verifyMessage,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";
import {
  ProposalBodySchema,
  canonicalJson,
  pinProposalDescription,
} from "@ipe-gov/ipfs";
import { PublicLockABI, addresses } from "@ipe-gov/sdk";

type Env = {
  PINATA_JWT: string;
  SEPOLIA_RPC_URL: string;
  ALLOWED_ORIGINS?: string;
};

const PinRequestSchema = z.object({
  text: z.string().min(1).max(8_000),
  address: z.custom<`0x${string}`>(
    (v) => typeof v === "string" && isAddress(v, { strict: false }),
    "invalid address",
  ),
  signature: z.custom<`0x${string}`>(
    (v) => isHex(v),
    "invalid signature",
  ),
  message: z.string().min(1).max(4_000),
  body: ProposalBodySchema.optional(),
});

type PinRequest = z.infer<typeof PinRequestSchema>;

const MAX_PIN_BYTES = 64 * 1024;

function parseBodyHash(message: string): Hex | null {
  const line = message.split("\n").find((l) => l.startsWith("body-hash: "));
  if (!line) return null;
  const v = line.slice("body-hash: ".length);
  return isHash(v) ? v : null;
}

/** Builds the exact message the client must sign. The web client mirrors this. */
function buildPinMessage(
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

function parseTimestamp(message: string): number {
  const line = message.split("\n").find((l) => l.startsWith("timestamp: "));
  if (!line) throw new Error("invalid message: missing timestamp line");
  const iso = line.slice("timestamp: ".length);
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error("invalid timestamp");
  return ms;
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const allow = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim());
  return cors({
    origin: allow.length && allow[0] ? allow : "*",
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })(c, next);
});

app.get("/", (c) => c.text("ipe-gov pin-api"));

app.post("/pin", async (c) => {
  // Cap the request size before parsing — anything larger is almost certainly
  // abuse (Pinata's own limit is far higher, but proposals shouldn't approach
  // it). `c.req.text()` reads the raw body once; we parse after the size gate.
  let raw: string;
  try {
    raw = await c.req.text();
  } catch {
    return c.json({ error: "could not read body" }, 400);
  }
  if (raw.length > MAX_PIN_BYTES) {
    return c.json({ error: "payload too large" }, 413);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  const parsed = PinRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return c.json(
      { error: "invalid request", issues: z.treeifyError(parsed.error) },
      400,
    );
  }
  const body: PinRequest = parsed.data;

  // 1. Signature must come from the claimed address over the exact message.
  const valid = await verifyMessage({
    address: body.address,
    message: body.message,
    signature: body.signature,
  });
  if (!valid) return c.json({ error: "signature does not match address" }, 401);

  // 2. Reject messages older than 10 minutes to limit replay.
  let ts: number;
  try {
    ts = parseTimestamp(body.message);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
  if (Math.abs(Date.now() - ts) > 10 * 60 * 1000) {
    return c.json({ error: "signed message is too old or too new" }, 401);
  }

  // 3. Claimed address must hold a valid Unlock key on the current lock.
  if (!c.env.SEPOLIA_RPC_URL) {
    return c.json({ error: "server missing SEPOLIA_RPC_URL" }, 500);
  }
  const client = createPublicClient({
    chain: sepolia,
    transport: http(c.env.SEPOLIA_RPC_URL),
  });
  const hasKey = await client.readContract({
    address: addresses.sepolia.lock as Hex,
    abi: PublicLockABI,
    functionName: "getHasValidKey",
    args: [body.address],
  });
  if (!hasKey) {
    return c.json({ error: "address does not hold a valid membership key" }, 403);
  }

  // 4. A structured body is bound to the signature via a `body-hash` line in
  //    the signed message. Reject in either direction: a body present without
  //    a committed hash (so an attacker can't attach arbitrary content to a
  //    legacy-shaped signature), or a committed hash without a body (so a
  //    relay can't strip the body and pin a degraded v1 envelope).
  const claimedHash = parseBodyHash(body.message);
  if (body.body !== undefined) {
    if (!claimedHash) {
      return c.json({ error: "signed message is missing body-hash" }, 401);
    }
    const computed = keccak256(toBytes(canonicalJson(body.body)));
    if (claimedHash.toLowerCase() !== computed.toLowerCase()) {
      return c.json({ error: "body-hash does not match signed body" }, 401);
    }
  } else if (claimedHash) {
    return c.json(
      { error: "signed message commits to a body-hash but no body was sent" },
      400,
    );
  }

  // 5. Pin to IPFS via Pinata.
  if (!c.env.PINATA_JWT) {
    return c.json({ error: "server missing PINATA_JWT" }, 500);
  }

  try {
    const { cid } = await pinProposalDescription({
      jwt: c.env.PINATA_JWT,
      text: body.text.trim(),
      proposer: body.address,
      body: body.body,
    });
    return c.json({ cid });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

// Exposed for the web client to build the exact same message shape via a
// shared helper if desired; not currently used over the network.
export { buildPinMessage };

export default app;

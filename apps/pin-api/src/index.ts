import { Hono } from "hono";
import { cors } from "hono/cors";
import { createPublicClient, http, verifyMessage, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { pinProposalDescription } from "@ipe-gov/ipfs";
import { MockPublicLockABI, addresses } from "@ipe-gov/sdk";

type Env = {
  PINATA_JWT: string;
  SEPOLIA_RPC_URL: string;
  ALLOWED_ORIGINS?: string;
};

type PinRequest = {
  text: string;
  address: Hex;
  signature: Hex;
  message: string;
};

/** Builds the exact message the client must sign. The web client mirrors this. */
function buildPinMessage(address: Hex, timestampMs: number): string {
  return [
    "ipe-gov: pin proposal description",
    `address: ${address}`,
    `timestamp: ${new Date(timestampMs).toISOString()}`,
  ].join("\n");
}

function parseTimestamp(message: string): number {
  const line = message.split("\n").find((l) => l.startsWith("timestamp: "));
  if (!line) throw new Error("invalid message: missing timestamp line");
  const iso = line.slice("timestamp: ".length);
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error("invalid timestamp");
  return ms;
}

function isValidAddress(s: unknown): s is Hex {
  return typeof s === "string" && /^0x[a-fA-F0-9]{40}$/.test(s);
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
  let body: PinRequest;
  try {
    body = await c.req.json<PinRequest>();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  if (!body.text?.trim()) return c.json({ error: "text is required" }, 400);
  if (!isValidAddress(body.address)) return c.json({ error: "invalid address" }, 400);
  if (!body.signature?.startsWith("0x")) return c.json({ error: "invalid signature" }, 400);
  if (!body.message) return c.json({ error: "message is required" }, 400);

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
    abi: MockPublicLockABI,
    functionName: "getHasValidKey",
    args: [body.address],
  });
  if (!hasKey) {
    return c.json({ error: "address does not hold a valid membership key" }, 403);
  }

  // 4. Pin to IPFS via Pinata.
  if (!c.env.PINATA_JWT) {
    return c.json({ error: "server missing PINATA_JWT" }, 500);
  }

  try {
    const { cid } = await pinProposalDescription({
      jwt: c.env.PINATA_JWT,
      text: body.text.trim(),
      proposer: body.address,
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

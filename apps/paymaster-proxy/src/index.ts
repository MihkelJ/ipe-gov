import { Hono } from "hono";
import { cors } from "hono/cors";
import { enforcePolicy, PolicyError, type UserOp } from "./policy";

type Env = {
  PIMLICO_API_KEY: string;
  SEPOLIA_RPC_URL: string;
  ALLOWED_ORIGINS?: string;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: unknown[];
};

type JsonRpcError = {
  jsonrpc: "2.0";
  id: number | string | null;
  error: { code: number; message: string };
};

function jsonRpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Methods that belong on Pimlico's bundler+paymaster endpoint. Everything
 * else (eth_call, eth_getLogs, eth_chainId, …) is forwarded to a regular
 * execution-layer node so the proxy can double as the community RPC.
 */
const PAYMASTER_METHODS = new Set<string>([
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  "pm_sponsorUserOperation",
  "pm_getPaymasterAndData",
  "eth_sendUserOperation",
  "eth_estimateUserOperationGas",
  "eth_getUserOperationReceipt",
  "eth_getUserOperationByHash",
  "eth_supportedEntryPoints",
]);

function isPaymasterMethod(method: string): boolean {
  return PAYMASTER_METHODS.has(method) || method.startsWith("pimlico_");
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

app.get("/", (c) => c.text("ipe-gov paymaster-proxy"));

app.post("/rpc", async (c) => {
  if (!c.env.SEPOLIA_RPC_URL) {
    return c.json(jsonRpcError(null, -32000, "server missing SEPOLIA_RPC_URL"), 500);
  }

  let body: JsonRpcRequest;
  try {
    body = await c.req.json<JsonRpcRequest>();
  } catch {
    return c.json(jsonRpcError(null, -32700, "invalid JSON"), 400);
  }

  const id = body.id ?? null;
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return c.json(jsonRpcError(id, -32600, "invalid JSON-RPC request"), 400);
  }

  // Public RPC path: forward any non-bundler method straight to the Sepolia
  // node. No membership gate — reads are free and the community should be
  // able to use this endpoint like any other RPC.
  if (!isPaymasterMethod(body.method)) {
    return forward(c.env.SEPOLIA_RPC_URL, body, id, 502);
  }

  // Paymaster path: gate on Unlock membership before spending Pimlico credits.
  // enforcePolicy is a no-op when params[0] has no sender, so handshake calls
  // like eth_supportedEntryPoints still pass through.
  const userOp = (body.params?.[0] ?? {}) as UserOp;
  try {
    await enforcePolicy(userOp, c.env.SEPOLIA_RPC_URL);
  } catch (err) {
    if (err instanceof PolicyError) {
      return c.json(jsonRpcError(id, -32001, err.message), 403);
    }
    return c.json(
      jsonRpcError(id, -32000, `policy check failed: ${(err as Error).message}`),
      500,
    );
  }

  if (!c.env.PIMLICO_API_KEY) {
    return c.json(jsonRpcError(id, -32000, "server missing PIMLICO_API_KEY"), 500);
  }
  const upstream = `https://api.pimlico.io/v2/11155111/rpc?apikey=${c.env.PIMLICO_API_KEY}`;
  return forward(upstream, body, id, 502);
});

async function forward(
  upstream: string,
  body: JsonRpcRequest,
  id: JsonRpcRequest["id"],
  errorStatus: number,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return Response.json(
      jsonRpcError(id, -32000, `upstream fetch failed: ${(err as Error).message}`),
      { status: errorStatus },
    );
  }

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export default app;

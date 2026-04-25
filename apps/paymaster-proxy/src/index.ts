import { Hono, type Context } from "hono";
import { applyCors } from "@ipe-gov/workers-shared";
import { getChainConfig } from "@ipe-gov/sdk";
import { isAddress, type Hex } from "viem";
import { enforcePolicy, PolicyError, type UserOp } from "./policy";

type Env = {
  PIMLICO_API_KEY: string;
  // Per-chain RPC URLs are read dynamically from
  // ChainConfig.nodeRpcSecretName, so they're indexed via [string]: string
  // rather than enumerated. Provision via `wrangler secret put RPC_URL_<id>`.
  ALLOWED_ORIGINS?: string;
  [secret: string]: string | undefined;
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

// Sepolia is the default chain for the legacy bare /rpc route. Existing
// frontends are pinned here until they're redeployed against /rpc/:chainId.
const DEFAULT_CHAIN_ID = 11155111;

const app = new Hono<{ Bindings: Env }>();

applyCors(app, { allowMethods: ["POST", "OPTIONS"] });

app.get("/", (c) => c.text("ipe-gov paymaster-proxy"));

app.post("/rpc", (c) => handleRpc(c, DEFAULT_CHAIN_ID));
app.post("/rpc/:chainId", (c) => {
  const raw = c.req.param("chainId");
  const chainId = Number(raw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return c.json(jsonRpcError(null, -32602, `invalid chainId: ${raw}`), 400);
  }
  return handleRpc(c, chainId);
});

async function handleRpc(
  c: Context<{ Bindings: Env }>,
  chainId: number,
): Promise<Response> {
  const config = getChainConfig(chainId);
  if (!config) {
    return c.json(
      jsonRpcError(null, -32602, `unsupported chain: ${chainId}`),
      400,
    );
  }

  const nodeRpcUrl = c.env[config.nodeRpcSecretName];
  if (!nodeRpcUrl) {
    return c.json(
      jsonRpcError(
        null,
        -32000,
        `server missing ${config.nodeRpcSecretName}`,
      ),
      500,
    );
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

  // Public RPC path: forward any non-bundler method straight to the chain's
  // node. No membership gate — reads are free and the community should be
  // able to use this endpoint like any other RPC.
  if (!isPaymasterMethod(body.method)) {
    return forward(nodeRpcUrl, body, id, 502);
  }

  // Operator allowlist (system actors like ens-api's mint wallet) opens the
  // bundler path even on chains where sponsorship is otherwise disabled.
  const operatorAllowlist = config.operatorAllowlistSecretName
    ? parseAllowlist(c.env[config.operatorAllowlistSecretName])
    : [];

  // Paymaster path: chains without a sponsorship config AND without an
  // operator allowlist reject bundler methods cleanly so callers get a
  // useful error instead of an opaque upstream failure.
  if (!config.sponsorship && operatorAllowlist.length === 0) {
    return c.json(
      jsonRpcError(
        id,
        -32601,
        `sponsorship not enabled for chain ${chainId}`,
      ),
      400,
    );
  }

  // enforcePolicy is a no-op when params[0] has no sender, so handshake calls
  // like eth_supportedEntryPoints still pass through.
  const userOp = (body.params?.[0] ?? {}) as UserOp;
  try {
    await enforcePolicy(userOp, nodeRpcUrl, {
      chain: config.chain,
      lockAddress: config.sponsorship?.lockAddress,
      operatorAllowlist,
    });
  } catch (err) {
    if (err instanceof PolicyError) {
      return c.json(jsonRpcError(id, -32001, err.message), 403);
    }
    return c.json(
      jsonRpcError(
        id,
        -32000,
        `policy check failed: ${(err as Error).message}`,
      ),
      500,
    );
  }

  if (!c.env.PIMLICO_API_KEY) {
    return c.json(
      jsonRpcError(id, -32000, "server missing PIMLICO_API_KEY"),
      500,
    );
  }
  const upstream = `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${c.env.PIMLICO_API_KEY}`;
  return forward(upstream, body, id, 502);
}

/** Parse a comma-separated list of addresses from a worker secret. Lowercased
 *  for cheap inclusion checks; invalid entries are silently dropped so a
 *  typo doesn't take the whole list down. */
function parseAllowlist(raw: string | undefined): Hex[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isAddress(s))
    .map((s) => s.toLowerCase() as Hex);
}

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

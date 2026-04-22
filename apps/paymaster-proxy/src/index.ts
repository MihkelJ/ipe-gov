import { Hono } from "hono";
import { cors } from "hono/cors";
import { enforcePolicy, PolicyError, type UserOp } from "./policy";

type Env = {
  PIMLICO_API_KEY: string;
  SEPOLIA_RPC_URL: string;
  ALLOWED_ORIGINS?: string;
};

type Variables = {
  rpcBody: JsonRpcRequest;
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

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  const allow = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim());
  return cors({
    origin: allow.length && allow[0] ? allow : "*",
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })(c, next);
});

app.get("/", (c) => c.text("ipe-gov paymaster-proxy"));

/**
 * Gate every /rpc request on membership before any other work happens —
 * before env checks, before forwarding, before even allocating an upstream
 * connection. Read-once buffers the body so the route handler can re-parse it.
 */
app.post("/rpc", async (c, next) => {
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

  // Single membership gate for every RPC call. enforcePolicy is a no-op when
  // params[0] has no sender (free upstream reads), so receipt polling and
  // chain queries pass through.
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

  c.set("rpcBody", body);
  await next();
});

app.post("/rpc", async (c) => {
  if (!c.env.PIMLICO_API_KEY) {
    return c.json(jsonRpcError(null, -32000, "server missing PIMLICO_API_KEY"), 500);
  }

  const body = c.get("rpcBody");
  const id = body.id ?? null;

  const upstream = `https://api.pimlico.io/v2/11155111/rpc?apikey=${c.env.PIMLICO_API_KEY}`;
  let res: Response;
  try {
    res = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return c.json(
      jsonRpcError(id, -32000, `upstream fetch failed: ${(err as Error).message}`),
      502,
    );
  }

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
});

export default app;

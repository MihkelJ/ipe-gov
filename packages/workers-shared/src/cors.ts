import type { Hono } from "hono";
import { cors } from "hono/cors";

export type ApplyCorsOptions = {
  /** HTTP methods to allow. Default is the union of methods our workers
   *  use today. Override per-worker if you want stricter exposure. */
  allowMethods?: string[];
  /** Headers the client may send. Default covers `Content-Type` for JSON +
   *  multipart bodies; add to it (don't replace) if a worker needs more. */
  allowHeaders?: string[];
};

const DEFAULT_METHODS = ["GET", "POST", "OPTIONS"];
const DEFAULT_HEADERS = ["Content-Type"];

/** Registers our env-driven CORS middleware on `app`. `ALLOWED_ORIGINS` is
 *  a comma-separated list; an empty / absent value falls back to `*` so a
 *  freshly-deployed worker is reachable from anywhere until you tighten it.
 *
 *  The generic parameter is `Hono<any>` rather than a structural Bindings
 *  constraint because Hono's own `Env` shape mixes Bindings + Variables and
 *  trying to express "Bindings includes ALLOWED_ORIGINS" without infecting
 *  the worker's full Env type causes more friction than it prevents. The
 *  per-worker `Env` type still has to declare `ALLOWED_ORIGINS?: string`
 *  for the runtime read to succeed; this helper just doesn't enforce it at
 *  the call site. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyCors(app: Hono<any>, options: ApplyCorsOptions = {}) {
  const { allowMethods = DEFAULT_METHODS, allowHeaders = DEFAULT_HEADERS } = options;
  app.use("*", async (c, next) => {
    const env = c.env as { ALLOWED_ORIGINS?: string };
    const allow = (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    return cors({
      origin: allow.length ? allow : "*",
      allowMethods,
      allowHeaders,
    })(c, next);
  });
}

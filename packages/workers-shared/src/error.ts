import type { Context } from "hono";

/** A thrown HttpError carries an HTTP status and a user-facing message. The
 *  per-route try/catch + `errorResponse` helper turns these into a clean
 *  JSON response without each handler having to write the same envelope. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** The set of statuses we ever throw — narrows the response type so Hono's
 *  `c.json` overload accepts it cleanly. */
export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 413 | 415 | 500 | 502;

/** Maps any thrown value to a JSON error response. `HttpError` keeps its
 *  status; anything else becomes a 500 with the `Error.message`. Wrap each
 *  route handler with `try { ... } catch (err) { return errorResponse(c, err) }`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function errorResponse(c: Context<any>, err: unknown) {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status as HttpStatus);
  }
  return c.json({ error: (err as Error).message }, 500);
}

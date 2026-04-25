import { MAX_REQUEST_BYTES } from "@ipe-gov/sdk";
import { z } from "zod";
import { HttpError } from "./error";

export type ReadJsonBodyOptions = {
  /** Max raw-body length in bytes. Defaults to `MAX_REQUEST_BYTES` from
   *  the SDK (8 KiB) — pin-api's binary endpoints should call `req.formData()`
   *  directly instead of going through this helper. */
  maxBytes?: number;
};

/** Reads a JSON request body, enforces a size cap, and runs it through a
 *  zod schema. Throws `HttpError` for every failure so the per-route
 *  `errorResponse` catch produces a consistent envelope. */
export async function readJsonBody<T extends z.ZodSchema>(
  req: Request,
  schema: T,
  options: ReadJsonBodyOptions = {},
): Promise<z.infer<T>> {
  const { maxBytes = MAX_REQUEST_BYTES } = options;

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    throw new HttpError(400, "could not read body");
  }
  if (raw.length > maxBytes) {
    throw new HttpError(413, "payload too large");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid JSON");
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new HttpError(400, `invalid request: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

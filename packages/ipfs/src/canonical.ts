/** Deterministic JSON serialization: object keys sorted alphabetically at
 *  every level, arrays preserved in order. Used to derive a stable hash over
 *  a proposal body so the client's signature can bind to exactly what the
 *  pin-api forwards to Pinata.
 *
 *  `undefined` properties are skipped — matching `JSON.stringify`, which
 *  drops them on the wire. Without this the client would hash a string
 *  containing `"key":undefined` while the Worker hashes the received
 *  (key-absent) object, and the two hashes would never match. */
export function canonicalJson(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) {
    return "[" + v.map((e) => (e === undefined ? "null" : canonicalJson(e))).join(",") + "]";
  }
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

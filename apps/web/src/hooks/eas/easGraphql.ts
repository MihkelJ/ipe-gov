// Thin wrapper around the EAS-hosted GraphQL indexer. v1 only targets the
// Sepolia endpoint; if/when we register schemas on more networks we'll route
// per chain via `easContracts`.

const EAS_GRAPHQL_ENDPOINT = "https://sepolia.easscan.org/graphql";

export type GraphQLError = { message: string; path?: (string | number)[] };

export async function easGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(EAS_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`EAS GraphQL ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { data?: T; errors?: GraphQLError[] };
  if (json.errors?.length) throw new Error(`EAS GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  if (!json.data) throw new Error("EAS GraphQL: empty response");

  return json.data;
}

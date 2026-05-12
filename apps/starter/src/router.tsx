import { createRouter as createTanStackRouter, Link } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

function DefaultNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-20 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        <Link to="/" className="underline underline-offset-4">
          Go home
        </Link>
      </p>
    </main>
  );
}

function DefaultError({ error }: { error: Error }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-20 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted-foreground">{error.message}</p>
    </main>
  );
}

export function getRouter(queryClient: QueryClient) {
  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: DefaultNotFound,
    defaultErrorComponent: DefaultError,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

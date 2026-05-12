import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { AppHeader } from "#/components/AppHeader";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <AppHeader />
      <Outlet />
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        ipe-gov starter — github.com/MihkelJ/ipe-gov
      </footer>
    </>
  );
}

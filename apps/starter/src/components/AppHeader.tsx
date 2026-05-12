import { Link } from "@tanstack/react-router";
import { useConnectWallet, usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { LogOut, Wallet } from "lucide-react";
import { Button } from "#/components/ui/button";
import { MembershipBadge } from "./MembershipBadge";

export function AppHeader() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { address } = useAccount();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="font-semibold tracking-tight">
          ipe-gov starter
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <MembershipBadge />
          {!ready ? (
            <span className="h-8 w-20 animate-pulse rounded-md bg-muted/60" />
          ) : !authenticated ? (
            <Button size="sm" onClick={login}>
              Sign in
            </Button>
          ) : (
            <>
              {!address ? (
                <Button size="sm" variant="outline" onClick={() => connectWallet()}>
                  <Wallet />
                  Connect
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={logout} aria-label="Sign out">
                <LogOut />
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useConnectWallet, usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { Menu, LogOut, User, Wallet, Plus } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "#/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Separator } from "#/components/ui/separator";
import { useEnsAvatar, useIdentity } from "#/hooks/useIdentity";
import { truncateAddress } from "#/lib/address";
import ThemeToggle from "./ThemeToggle";

type NavItem = { to: string; label: string };

const NAV: NavItem[] = [
  { to: "/proposals", label: "Proposals" },
  { to: "/members", label: "Members" },
];

function Wordmark() {
  return (
    <Link
      to="/"
      className="group flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
      aria-label="ipe-gov home"
    >
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-sm bg-foreground text-background font-mono text-[11px] font-bold tracking-tighter shadow-sm transition-transform group-hover:-rotate-3"
      >
        ig
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-semibold tracking-tight text-base leading-none">
          ipe<span className="text-muted-foreground">·</span>gov
        </span>
        <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground leading-none">
          v0
        </span>
      </span>
    </Link>
  );
}

export default function Header() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { address } = useAccount();
  const { data: displayName } = useIdentity(address);
  const { data: avatarUrl } = useEnsAvatar(displayName);
  const label = displayName ?? (address ? truncateAddress(address) : "Account");
  const fallback = displayName
    ? displayName.slice(0, 2).toUpperCase()
    : address
      ? address.slice(2, 4).toUpperCase()
      : "··";

  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinkBase = "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

  return (
    <header
      data-scrolled={scrolled}
      className="sticky top-0 z-50 border-b border-transparent bg-background/70 backdrop-blur-lg transition-colors data-[scrolled=true]:border-border data-[scrolled=true]:bg-background/85 supports-[backdrop-filter]:bg-background/60"
    >
      <nav className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:h-16 sm:gap-6 sm:px-6">
        <Wordmark />

        {/* Desktop nav */}
        <ul className="hidden md:flex items-center gap-1 ml-2">
          {NAV.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className={`${navLinkBase} relative px-3 py-2 rounded-md hover:bg-accent/60`}
                activeProps={{
                  className: "text-foreground bg-accent/40 [&::after]:opacity-100",
                }}
              >
                <span>{item.label}</span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-3 -bottom-px h-px bg-foreground opacity-0 transition-opacity"
                />
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* New proposal — desktop only, contextual call-to-action */}
          {authenticated ? (
            <Button asChild size="sm" variant="ghost" className="hidden lg:inline-flex">
              <Link to="/proposals/new">
                <Plus />
                Propose
              </Link>
            </Button>
          ) : null}

          {/* Auth state */}
          {!ready ? (
            <div className="h-8 w-20 rounded-md bg-muted/60 animate-pulse" />
          ) : !authenticated ? (
            <Button size="sm" onClick={login} className="hidden sm:inline-flex">
              Sign in
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border/70 bg-background pl-1 pr-3 py-1 text-sm transition-all hover:border-foreground/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Account menu"
                >
                  <Avatar className="size-6">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={label} /> : null}
                    <AvatarFallback className="font-mono text-[9px] uppercase tracking-wider">
                      {fallback}
                    </AvatarFallback>
                  </Avatar>
                  <span className={`max-w-[10ch] truncate ${displayName ? "" : "font-mono text-xs"}`}>{label}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                    Signed in
                  </span>
                  <span className={`truncate ${displayName ? "" : "font-mono text-xs"}`}>{label}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <User />
                    Your profile
                  </Link>
                </DropdownMenuItem>
                {!address ? (
                  <DropdownMenuItem onSelect={() => connectWallet()}>
                    <Wallet />
                    Connect wallet
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => logout()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          {/* Mobile menu trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[86vw] max-w-sm p-0">
              <SheetHeader className="border-b">
                <SheetTitle className="flex items-baseline gap-2">
                  <span className="font-semibold tracking-tight">
                    ipe<span className="text-muted-foreground">·</span>gov
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Menu</span>
                </SheetTitle>
              </SheetHeader>

              <div className="flex flex-col gap-1 p-3">
                {NAV.map((item) => (
                  <SheetClose asChild key={item.to}>
                    <Link
                      to={item.to}
                      className="flex items-center justify-between rounded-md px-3 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      activeProps={{
                        className: "bg-accent text-foreground",
                      }}
                    >
                      <span>{item.label}</span>
                      <span
                        aria-hidden
                        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                      >
                        →
                      </span>
                    </Link>
                  </SheetClose>
                ))}
                {authenticated ? (
                  <SheetClose asChild>
                    <Link
                      to="/profile"
                      className="flex items-center justify-between rounded-md px-3 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      activeProps={{ className: "bg-accent text-foreground" }}
                    >
                      <span>Your profile</span>
                      <span
                        aria-hidden
                        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                      >
                        →
                      </span>
                    </Link>
                  </SheetClose>
                ) : null}
                {authenticated ? (
                  <SheetClose asChild>
                    <Link
                      to="/proposals/new"
                      className="mt-1 flex items-center gap-2 rounded-md bg-foreground px-3 py-3 text-base font-medium text-background transition-opacity hover:opacity-90"
                    >
                      <Plus className="size-4" />
                      New proposal
                    </Link>
                  </SheetClose>
                ) : null}
              </div>

              <Separator />

              <div className="flex flex-col gap-3 p-4">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Account</span>
                {!ready ? (
                  <div className="h-10 rounded-md bg-muted/60 animate-pulse" />
                ) : !authenticated ? (
                  <Button
                    onClick={() => {
                      setMobileOpen(false);
                      login();
                    }}
                  >
                    Sign in
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 rounded-md border border-border/70 px-3 py-2.5">
                      <Avatar className="size-8">
                        {avatarUrl ? <AvatarImage src={avatarUrl} alt={label} /> : null}
                        <AvatarFallback className="font-mono text-[10px] uppercase tracking-wider">
                          {fallback}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                          Signed in
                        </span>
                        <span className={`truncate ${displayName ? "text-sm" : "font-mono text-xs"}`}>{label}</span>
                      </div>
                    </div>
                    {!address ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setMobileOpen(false);
                          connectWallet();
                        }}
                      >
                        <Wallet />
                        Connect wallet
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMobileOpen(false);
                        logout();
                      }}
                    >
                      <LogOut />
                      Sign out
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}

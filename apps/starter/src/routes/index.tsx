import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowRight, ArrowUpRight, CheckCircle2, Plus } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { ready, authenticated, login } = usePrivy();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <section className="space-y-5">
        <Badge variant="secondary">Community monorepo</Badge>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Build alongside a community.
        </h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          A monorepo where every member-driven app shares one stack — login, wallets, membership,
          credentials, encrypted voting. Build whatever fits: a directory, a forum, group
          decisions, a skill exchange, something nobody's tried yet. Open a PR when you're ready —
          the community sees what you built, and the pieces that worked become building blocks for
          the next idea.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          {!authenticated ? (
            <Button size="lg" onClick={login} disabled={!ready}>
              Try signing in
              <ArrowRight />
            </Button>
          ) : (
            <Button size="lg" variant="secondary" disabled>
              <CheckCircle2 />
              You're in — start building
            </Button>
          )}
          <Button asChild size="lg" variant="outline">
            <a href="https://github.com/MihkelJ/ipe-gov" target="_blank" rel="noreferrer">
              View on GitHub
              <ArrowUpRight />
            </a>
          </Button>
        </div>
      </section>

      <Separator className="my-12" />

      <section className="space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">Why this works</h2>
          <p className="text-sm text-muted-foreground">Two things you don't get when you build alone.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Reason title="One toolkit, maintained together.">
            All the plumbing — login, wallets, membership, credentials, encrypted voting — is kept
            up by everyone building here. Improvements you make ripple to every app in the repo.
          </Reason>
          <Reason title="Apps that speak the same language.">
            Membership and identity are shared layers, so anything you build composes with what's
            already here. Your app reads the same data <Code>apps/web</Code> reads, and the other
            way around.
          </Reason>
        </div>
      </section>

      <Separator className="my-12" />

      <section className="space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">What lives here today</h2>
          <p className="text-sm text-muted-foreground">A few apps already. Yours next.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <MonorepoApp
            slug="apps/web"
            title="Reference governance app"
            body="Confidential voting, proposals, a member directory, ENS subname claims — all wired together."
            href="https://github.com/MihkelJ/ipe-gov/tree/master/apps/web"
            hrefLabel="Read the source"
          />
          <MonorepoApp
            slug="apps/starter"
            title="The template"
            body="You're looking at it. Don't edit this folder — scaffold a fresh copy with pnpm new-app."
          />
          <MonorepoApp
            slug="apps/your-name"
            title="Your app, future tense"
            body="Build it, PR it, we welcome it in. The next person learns from your code."
            href="https://github.com/MihkelJ/ipe-gov/pulls"
            hrefLabel="Contribute"
            placeholder
          />
        </div>
      </section>

      <Separator className="my-12" />

      <section className="space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">What you can wire up tonight</h2>
          <p className="text-sm text-muted-foreground">
            Every one of these reads or writes to on-chain state shared with every app here. No
            backend to keep alive. No API key to rotate.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Feature
            title="Member-only spaces."
            importLine={`import { useMembership } from "#/hooks/useMembership";`}
          >
            A forum, a directory, a private chat, a file drop — gate any of it behind one Unlock
            key check. The same key works in <Code>apps/web</Code>, in this starter, and in
            whatever you build.
          </Feature>
          <Feature
            title="Credentials that travel."
            importLine={`import { encodeAttestationData, schemaUids } from "@ipe-gov/eas";`}
          >
            Issue an EAS attestation from your app — workshop completed, role granted, skill
            verified. It lives on-chain; any app here can render it. Yours can read what others
            wrote, too.
          </Feature>
          <Feature
            title="Group decisions, ballots private."
            importLine={`import { createInstance } from "@zama-fhe/relayer-sdk";`}
          >
            Plug into the Governor contract for any vote your app needs. Individual ballots stay
            FHE-encrypted; only the tally is revealed. Or write your own decision flow on top of
            the same primitives.
          </Feature>
          <Feature
            title="Free transactions for members."
            importLine={`import { useSponsoredWrite } from "#/hooks/useSponsoredWrite";`}
          >
            Members never pay gas in your app. Wrap any write call and the relayer covers it —
            same pattern <Code>apps/web</Code> uses for voting and proposals.
          </Feature>
          <Feature
            title="Content anyone can verify."
            importLine={`import { ipfsGatewayUrl } from "@ipe-gov/ipfs";`}
          >
            Pin files to IPFS through the community pin-api; the CID goes on-chain. Other apps
            (and other gateways) fetch the same bytes you wrote.
          </Feature>
          <Feature
            title="Reuse what's already on-chain."
            importLine={`import { addresses, PublicLockABI } from "@ipe-gov/sdk";`}
          >
            Addresses and ABIs ship from one package. Read attestations, votes, names, proposals
            — anything any app here has written is yours to surface.
          </Feature>
        </div>
      </section>

      <Card className="mt-12">
        <CardHeader>
          <CardTitle>What every app gets for free</CardTitle>
          <CardDescription>Everything below is already wired. You just import and use it.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Row label="Login" tech="Email, Google, or any crypto wallet" />
          <Row label="Wallets" tech="Auto-created for users without one" />
          <Row label="Members check" tech="A live badge in the header — yes or no" />
          <Row label="Free transactions" tech="Members never pay gas (via useSponsoredWrite)" />
          <Row label="On-chain credentials" tech="Issue and read attestations (via EAS)" />
          <Row label="File uploads" tech="Pin to IPFS (via Pinata)" />
          <Row label="Encrypted voting" tech="FHE-encrypted ballots (via Zama)" />
          <Row label="UI" tech="Tailwind + shadcn components, drop-in" />
          <Row label="Pages" tech="Add a file, get a URL" />
        </CardContent>
      </Card>

      <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        Built something? Open a PR. The community sees your work, reuses what holds up, and
        builds on it.
      </footer>
    </main>
  );
}

function Reason({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

function Feature({
  title,
  children,
  importLine,
}: {
  title: string;
  children: ReactNode;
  importLine: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>{children}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
          {importLine}
        </pre>
      </CardContent>
    </Card>
  );
}

function MonorepoApp({
  slug,
  title,
  body,
  href,
  hrefLabel,
  placeholder,
}: {
  slug: string;
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
  placeholder?: boolean;
}) {
  return (
    <Card
      className={
        placeholder
          ? "h-full border-dashed bg-transparent transition-colors hover:border-foreground/60"
          : "h-full transition-colors hover:border-foreground/40"
      }
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          {placeholder ? (
            <span className="grid size-7 shrink-0 place-items-center rounded-md border border-dashed text-muted-foreground [&>svg]:size-3.5">
              <Plus />
            </span>
          ) : null}
          <code className="font-mono text-xs text-muted-foreground">{slug}</code>
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      {href ? (
        <CardContent>
          <Button asChild variant="link" size="sm" className="h-auto p-0">
            <a href={href} target="_blank" rel="noreferrer">
              {hrefLabel ?? "Open"}
              <ArrowUpRight />
            </a>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

function Row({ label, tech }: { label: string; tech: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium sm:text-right">{tech}</span>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>;
}

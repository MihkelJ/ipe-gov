import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { formatUnits, getAddress, isAddress, type Hex } from "viem";
import { ENS_PARENT_NAME, tokens } from "@ipe-gov/sdk";
import RequireUnlockMembership from "#/components/RequireUnlockMembership";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { useAllMembers, type MemberKey } from "#/hooks/useMembers";
import { useMemberBalances } from "#/hooks/useMemberBalances";
import { useEnsAvatar, useIdentity } from "#/hooks/useIdentity";
import { useEnsTextRecords } from "#/hooks/useEnsTextRecords";
import { useProposalsByAuthor, type AuthoredProposal } from "#/hooks/useProposalsByAuthor";
import { useMemberActivity, type MemberActivityRow } from "#/hooks/useMemberActivity";
import { useProposalDescription } from "#/hooks/useProposalDescription";
import { truncateAddress } from "#/lib/address";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/members/$address")({
  head: ({ params }) => ({
    meta: [{ title: `${truncateAddress(params.address as Hex)} — Member dossier` }],
  }),
  component: MemberProfileGuarded,
});

function MemberProfileGuarded() {
  return (
    <RequireUnlockMembership>
      <MemberProfilePage />
    </RequireUnlockMembership>
  );
}

const EYEBROW = "font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground";
const SECTION_HEADING = "font-mono text-[11px] uppercase tracking-[0.2em] text-foreground";
const NEVER_THRESHOLD = BigInt(Number.MAX_SAFE_INTEGER);
const TEXT_KEYS = ["description", "url", "com.twitter", "com.github", "email"] as const;

function MemberProfilePage() {
  const { address: rawAddress } = Route.useParams();

  if (!isAddress(rawAddress)) {
    return <InvalidAddress raw={rawAddress} />;
  }
  const address = getAddress(rawAddress);

  return <Dossier address={address} />;
}

function InvalidAddress({ raw }: { raw: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-20 text-center sm:px-6 sm:pt-24">
      <div className={EYEBROW}>§ Member · Not found</div>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        That doesn&rsquo;t look like an address.
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">
        <code className="font-mono break-all">{raw}</code> isn&rsquo;t a valid 0x address.
      </p>
      <Link
        to="/members"
        className="mt-10 inline-block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to the register
      </Link>
    </main>
  );
}

type StatusKind = "loading" | "member" | "former" | "none";

function Dossier({ address }: { address: Hex }) {
  const { data: identity, isLoading: identityLoading } = useIdentity(address);
  const { data: avatarUrl } = useEnsAvatar(identity);
  const { data: members = [], isLoading: membersLoading } = useAllMembers();

  const member = useMemo<MemberKey | undefined>(
    () => members.find((m) => m.owner.toLowerCase() === address.toLowerCase()),
    [members, address],
  );
  const memberList = useMemo(() => (member ? [member] : []), [member]);
  const { balances, isLoading: balanceLoading } = useMemberBalances(memberList);
  const balance = balances.get(address.toLowerCase() as Hex);

  const nowSec = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), []);
  const isLiveMember = Boolean(member) && member!.expiration > nowSec;
  const status: StatusKind =
    identityLoading || membersLoading ? "loading" : isLiveMember ? "member" : member ? "former" : "none";

  const subname = identity && identity.endsWith(`.${ENS_PARENT_NAME}`) ? identity : undefined;
  const ensName = identity && !subname ? identity : undefined;
  const displayName = subname ?? ensName ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <div className="mb-6 sm:mb-10">
        <Link to="/members" className={cn(EYEBROW, "transition-colors hover:text-foreground")}>
          ← The register
        </Link>
      </div>

      <div className={cn(EYEBROW, "mb-4")}>§ Member · Dossier</div>

      <IdentityHero
        address={address}
        identity={identity ?? null}
        identityLoading={identityLoading}
        avatarUrl={avatarUrl}
        status={status}
      />

      <PassportStrip
        status={status}
        member={member}
        balance={balance}
        balanceLoading={balanceLoading}
        nowSec={nowSec}
      />

      <IdentityPanel name={displayName} />

      <AuthoredSection address={address} />

      <ActivitySection address={address} />
    </main>
  );
}

/* ─────────────────────────  Hero  ───────────────────────── */

function IdentityHero({
  address,
  identity,
  identityLoading,
  avatarUrl,
  status,
}: {
  address: Hex;
  identity: string | null;
  identityLoading: boolean;
  avatarUrl: string | undefined | null;
  status: StatusKind;
}) {
  const initials = (identity ? identity.slice(0, 2) : address.slice(2, 4)).toUpperCase();

  return (
    <Card className="overflow-hidden py-0 shadow-none">
      <CardContent
        className={cn("grid gap-5 p-5 sm:p-7", "grid-cols-1 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-7")}
      >
        <div className="flex items-start justify-between gap-3 md:contents">
          <Avatar className="size-16 rounded-2xl sm:size-20 md:size-24">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={identity ?? address} className="rounded-2xl object-cover" />
            ) : null}
            <AvatarFallback className="rounded-2xl font-mono text-base uppercase tracking-wider">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="md:hidden">
            <StatusBadge status={status} />
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <h1
            className={cn(
              "min-w-0 break-words font-semibold leading-[1.02] tracking-tight",
              "text-[clamp(1.65rem,7vw,3rem)]",
            )}
          >
            {identityLoading ? (
              <Skeleton className="h-9 w-56 sm:h-12 sm:w-72" />
            ) : identity ? (
              identity
            ) : (
              <span className="font-mono">{truncateAddress(address)}</span>
            )}
          </h1>

          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <StatusBadge status={status} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch md:justify-self-end">
          <CopyButton value={address} label="Copy address" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: StatusKind }) {
  if (status === "loading") {
    return (
      <Badge
        variant="outline"
        className="rounded-none font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
      >
        Resolving…
      </Badge>
    );
  }
  if (status === "member") {
    return (
      <Badge
        variant="outline"
        className="rounded-none border-foreground/80 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground"
      >
        <span className="mr-1.5 inline-block size-1.5 rounded-full bg-emerald-500" />
        Member · Active
      </Badge>
    );
  }
  if (status === "former") {
    return (
      <Badge
        variant="outline"
        className="rounded-none font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
      >
        Former member
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="rounded-none border-dashed font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
    >
      Not a member
    </Badge>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function handle() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={handle} className="gap-1.5" aria-label={label}>
      {copied ? (
        <>
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          {label}
        </>
      )}
    </Button>
  );
}

/* ─────────────────────────  Passport strip  ───────────────────────── */

function PassportStrip({
  status,
  member,
  balance,
  balanceLoading,
  nowSec,
}: {
  status: StatusKind;
  member: MemberKey | undefined;
  balance: bigint | undefined;
  balanceLoading: boolean;
  nowSec: bigint;
}) {
  const expires = member ? describeExpiry(member.expiration, nowSec) : null;
  const balanceLabel =
    balance !== undefined
      ? `${formatToken(balance, tokens.base.ipe.decimals)} ${tokens.base.ipe.symbol}`
      : balanceLoading
        ? "…"
        : `— ${tokens.base.ipe.symbol}`;

  const cells: Array<[string, React.ReactNode]> = [
    ["Status", statusLabel(status)],
    ["Joined", member ? `block ${member.createdAtBlock.toLocaleString()}` : "—"],
    ["Expires", expires ? expires.label : "—"],
    [`IPE · ${tokens.base.ipe.symbol}`, balanceLabel],
  ];

  return (
    <dl
      className={cn(
        "mt-7 flex gap-x-6 gap-y-3 overflow-x-auto pb-1 font-mono text-xs",
        "md:grid md:grid-cols-4 md:gap-x-8 md:overflow-visible",
      )}
    >
      {cells.map(([k, v]) => (
        <div key={k} className="flex min-w-[8.5rem] shrink-0 flex-col gap-1 border-t border-border pt-2 md:min-w-0">
          <dt className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{k}</dt>
          <dd className="truncate text-foreground/90">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function statusLabel(status: StatusKind): string {
  if (status === "loading") return "Resolving…";
  if (status === "member") return "Active";
  if (status === "former") return "Former";
  return "Not a member";
}

/* ─────────────────────────  Identity records  ───────────────────────── */

function IdentityPanel({ name }: { name: string | null }) {
  const { data: records, isLoading } = useEnsTextRecords(name, TEXT_KEYS);
  const present = useMemo(() => {
    if (!records) return [] as Array<readonly [string, string]>;
    return TEXT_KEYS.filter((k) => records[k] && records[k].length > 0).map((k) => [k, records[k]] as const);
  }, [records]);

  if (!name) return null;
  if (!isLoading && present.length === 0) return null;

  return (
    <section className="mt-10 border-t border-border pt-10 sm:mt-14 sm:pt-12">
      <SectionHead num="01" title="Identity" />
      {isLoading ? (
        <Skeleton className="mt-6 h-16 w-full max-w-xl" />
      ) : (
        <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {present.map(([k, v]) => {
            const isBio = k === "description";
            return (
              <div key={k} className={cn("flex flex-col gap-2", isBio ? "sm:col-span-2" : "min-w-0")}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {prettyKey(k)}
                </dt>
                <dd
                  className={cn(
                    "break-words text-foreground/90",
                    isBio ? "max-w-2xl font-serif text-[17px] leading-relaxed" : "font-mono text-[13px]",
                  )}
                >
                  {isUrl(v) ? (
                    <a
                      href={v}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
                    >
                      {v}
                    </a>
                  ) : (
                    v
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

/* ─────────────────────────  Section heading  ───────────────────────── */

function SectionHead({ num, title, trailing }: { num: string; title: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <h2 className={SECTION_HEADING}>
        §&nbsp;{num}&nbsp;&nbsp;{title}
      </h2>
      {trailing != null ? <span className={cn(EYEBROW, "truncate")}>{trailing}</span> : null}
    </div>
  );
}

/* ─────────────────────────  Authored motions  ───────────────────────── */

function AuthoredSection({ address }: { address: Hex }) {
  const { data: authored, isLoading } = useProposalsByAuthor(address);

  return (
    <section className="mt-10 border-t border-border pt-10 sm:mt-14 sm:pt-12">
      <SectionHead
        num="02"
        title="Motions authored"
        trailing={isLoading ? "…" : `${authored.length} ${authored.length === 1 ? "motion" : "motions"}`}
      />
      {isLoading ? (
        <Skeleton className="mt-6 h-16 w-full" />
      ) : authored.length === 0 ? (
        <EmptyNote>No motions authored yet — when this member files one, it&rsquo;ll surface here.</EmptyNote>
      ) : (
        <ol className="mt-6 divide-y divide-border border-y border-border">
          {authored.map((p) => (
            <AuthoredRow key={p.id.toString()} proposal={p} />
          ))}
        </ol>
      )}
    </section>
  );
}

function AuthoredRow({ proposal }: { proposal: AuthoredProposal }) {
  const { body, text, isLoading } = useProposalDescription(proposal.descriptionCid);
  const title = body?.headline ?? text ?? `Proposal #${proposal.id.toString()}`;
  const stateLabel = proposal.finalized ? "Finalized" : "Open";

  return (
    <li>
      <Link
        to="/proposals/$proposalId"
        params={{ proposalId: proposal.id.toString() }}
        className="flex items-start gap-4 px-1 py-5 transition-colors hover:bg-accent/40 sm:gap-6 sm:py-6"
      >
        <span className="shrink-0 pt-0.5 font-light tabular-nums text-muted-foreground text-xl sm:text-2xl">
          {proposal.id.toString().padStart(2, "0")}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[16px] leading-snug text-foreground sm:truncate sm:text-[17px]">
              {isLoading ? "…" : title}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              ends · block {proposal.endBlock.toLocaleString()}
            </div>
          </div>
          <span className="self-start font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:self-auto sm:text-right">
            {stateLabel}
          </span>
        </div>
      </Link>
    </li>
  );
}

/* ─────────────────────────  Activity  ───────────────────────── */

function ActivitySection({ address }: { address: Hex }) {
  const { rows, isLoading } = useMemberActivity(address);
  const visible = useMemo(
    () => rows.filter((r) => r.delegatedTo || r.delegatorsIn.length > 0 || r.votedDirectly || r.countedBy),
    [rows],
  );

  return (
    <section className="mt-10 border-t border-border pt-10 sm:mt-14 sm:pt-12">
      <SectionHead num="03" title="Voting & delegation" trailing={isLoading ? "…" : `${visible.length} active`} />
      {isLoading ? (
        <Skeleton className="mt-6 h-16 w-full" />
      ) : visible.length === 0 ? (
        <EmptyNote>No activity recorded yet — votes, delegations and inbound delegators will appear here.</EmptyNote>
      ) : (
        <ul className="mt-6 divide-y divide-border border-y border-border">
          {visible.map((r) => (
            <ActivityRow key={r.proposalId.toString()} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityRow({ row }: { row: MemberActivityRow }) {
  const tags: Array<{ label: string; tone: "on" | "off" }> = [];
  if (row.votedDirectly) tags.push({ label: "Voted directly", tone: "on" });
  if (row.delegatedTo)
    tags.push({
      label: `Delegated → ${truncateAddress(row.delegatedTo)}`,
      tone: "off",
    });
  if (row.countedBy && !row.votedDirectly)
    tags.push({
      label: `Counted by ${truncateAddress(row.countedBy)}`,
      tone: "off",
    });
  if (row.delegatorsIn.length > 0)
    tags.push({
      label: `${row.delegatorsIn.length} inbound delegator${row.delegatorsIn.length === 1 ? "" : "s"}`,
      tone: "on",
    });

  return (
    <li>
      <Link
        to="/proposals/$proposalId"
        params={{ proposalId: row.proposalId.toString() }}
        className="flex items-start gap-4 px-1 py-5 transition-colors hover:bg-accent/40 sm:gap-6 sm:py-6"
      >
        <span className="shrink-0 pt-0.5 font-light tabular-nums text-muted-foreground text-xl sm:text-2xl">
          {row.proposalId.toString().padStart(2, "0")}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t.label}
              className={cn(
                "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
                t.tone === "on" ? "border-foreground/80 text-foreground" : "border-border text-muted-foreground",
              )}
            >
              {t.label}
            </span>
          ))}
        </div>
      </Link>
    </li>
  );
}

/* ─────────────────────────  Helpers  ───────────────────────── */

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 border border-dashed border-border px-5 py-6 font-serif text-[15px] italic text-muted-foreground">
      {children}
    </p>
  );
}

function describeExpiry(expiration: bigint, nowSec: bigint): { label: string; soon: boolean } {
  if (expiration >= NEVER_THRESHOLD) return { label: "Never", soon: false };
  if (expiration <= nowSec) {
    return {
      label: `expired ${formatRelative(nowSec - expiration, "ago")}`,
      soon: false,
    };
  }
  const delta = expiration - nowSec;
  const soon = delta < 60n * 60n * 24n * 30n;
  return { label: formatRelative(delta, "left"), soon };
}

function formatRelative(deltaSec: bigint, suffix: "ago" | "left"): string {
  const day = 60n * 60n * 24n;
  if (deltaSec < day) {
    const hours = Number(deltaSec / 3600n);
    return `${hours}h ${suffix}`;
  }
  const days = deltaSec / day;
  if (days < 60n) return `${days.toString()}d ${suffix}`;
  const months = days / 30n;
  if (months < 24n) return `${months.toString()}mo ${suffix}`;
  const years = days / 365n;
  return `${years.toString()}y ${suffix}`;
}

function formatToken(amount: bigint, decimals: number): string {
  const v = Number(formatUnits(amount, decimals));
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function prettyKey(k: string): string {
  switch (k) {
    case "com.twitter":
      return "Twitter";
    case "com.github":
      return "GitHub";
    case "url":
      return "URL";
    case "email":
      return "Email";
    case "description":
      return "Bio";
    default:
      return k;
  }
}

function isUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

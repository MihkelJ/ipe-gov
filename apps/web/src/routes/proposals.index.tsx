import { createFileRoute, Link } from "@tanstack/react-router";
import type { Hex } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { UnlockConfidentialGovernorLiquidABI, addresses } from "@ipe-gov/sdk";
import { useProposal } from "../hooks/useProposal";
import { useProposalDescription } from "../hooks/useProposalDescription";
import { formatCountdown, useBlockCountdown } from "../hooks/useBlockCountdown";
import RequireUnlockMembership from "#/components/RequireUnlockMembership";
import { Plus } from "lucide-react";

// Same warm sealing-wax ink that anchors the drafting wizard. Scoped to this
// route via inline style on <main> so the rest of the app keeps its
// monochrome ledger palette.
const INK = "oklch(0.55 0.18 35)";

export const Route = createFileRoute("/proposals/")({
  head: () => ({ meta: [{ title: "Proposals — ipe-gov" }] }),
  component: ProposalsGuarded,
});

function ProposalsGuarded() {
  return (
    <RequireUnlockMembership>
      <ProposalsPage />
    </RequireUnlockMembership>
  );
}

function ProposalsPage() {
  const { isConnected } = useAccount();
  const { data: count } = useReadContract({
    address: addresses.sepolia.governorLiquid as Hex,
    abi: UnlockConfidentialGovernorLiquidABI,
    functionName: "proposalCount",
  });
  const total = count ? Number(count) : 0;
  const ids = Array.from({ length: total }, (_, i) => total - i);

  return (
    <main style={{ ["--ink" as string]: INK }} className="relative mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b border-border pb-7 sm:pb-9">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:text-[11px]">
              The Register · Sepolia
            </div>
            <h1
              className="font-display mt-2 text-4xl font-[600] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]"
              style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0" }}
            >
              Proposals
            </h1>
            <p className="mt-2 max-w-md font-serif text-[14px] italic leading-relaxed text-muted-foreground sm:text-[15px]">
              Every motion before the assembly, in order of filing.
            </p>
          </div>
          {isConnected ? <DraftCta /> : null}
        </div>
        {total > 0 ? (
          <div className="mt-6 flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:text-[11px]">
            <span
              className="font-display text-[15px] tabular-nums sm:text-[16px]"
              style={{
                color: "var(--ink)",
                fontVariationSettings: "'opsz' 60, 'SOFT' 0",
              }}
            >
              {String(total).padStart(2, "0")}
            </span>
            <span>{total === 1 ? "motion on file" : "motions on file"}</span>
          </div>
        ) : null}
      </header>

      <section className="mt-8 sm:mt-10">
        {ids.length === 0 ? (
          <EmptyRegister isConnected={isConnected} />
        ) : (
          <ul className="space-y-3">
            {ids.map((id) => (
              <ProposalCard key={id} id={id} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function DraftCta() {
  return (
    <Link
      to="/proposals/new"
      className="inline-flex h-10 cursor-pointer items-center gap-2 px-4 font-mono text-[10px] uppercase tracking-[0.22em] text-primary-foreground transition-opacity hover:opacity-90 sm:text-[11px]"
      style={{ background: "var(--ink)" }}
    >
      <Plus aria-hidden className="h-4 w-4" />
      Draft a motion
    </Link>
  );
}

function EmptyRegister({ isConnected }: { isConnected: boolean }) {
  return (
    <div
      className="bg-secondary/30 px-6 py-16 text-center"
      style={{
        border: "1px dashed color-mix(in oklch, currentColor 22%, transparent)",
      }}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
        The register stands clean
      </div>
      <p className="mx-auto mt-3 max-w-sm font-serif text-[15px] italic leading-relaxed text-muted-foreground">
        No motions have been filed yet. Be the first to enter one before the assembly.
      </p>
      {isConnected ? (
        <div className="mt-6 flex justify-center">
          <DraftCta />
        </div>
      ) : null}
    </div>
  );
}

type StatusTone = "open" | "awaiting" | "filed";

function ProposalCard({ id }: { id: number }) {
  const proposal = useProposal(BigInt(id));
  const { text, body } = useProposalDescription(proposal.descriptionCid);

  const status: StatusTone = proposal.finalized ? "filed" : proposal.votingClosed ? "awaiting" : "open";

  const remaining = useBlockCountdown(status === "open" ? proposal.endBlock : undefined);

  const title = text ?? (proposal.descriptionCid ? "Loading description…" : `Proposal #${id}`);
  const totalCost = body?.totalCost;
  const authors = body ? 1 + (body.authors?.coAuthors?.length ?? 0) : undefined;

  if (status === "filed") return <FiledRow id={id} title={title} />;

  return (
    <SessionCard
      id={id}
      title={title}
      status={status}
      endBlock={proposal.endBlock}
      remaining={remaining}
      totalCost={totalCost}
      authors={authors}
    />
  );
}

/* ============================================================
 * Filed — compressed archive row.
 *   Less visual weight than active sessions; the same line
 *   format as a printed register's index of past resolutions.
 * ============================================================ */
function FiledRow({ id, title }: { id: number; title: string }) {
  return (
    <li>
      <Link
        to="/proposals/$proposalId"
        params={{ proposalId: String(id) }}
        className="group flex items-baseline justify-between gap-4 border-b border-border py-3 transition-colors hover:bg-accent/40"
      >
        <span className="flex min-w-0 items-baseline gap-3 sm:gap-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] tabular-nums text-muted-foreground">
            № {String(id).padStart(2, "0")}
          </span>
          <span className="truncate font-serif text-[15px] text-foreground sm:text-[16px]">{title}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:text-foreground">
          filed
        </span>
      </Link>
    </li>
  );
}

/* ============================================================
 * Session card — open or awaiting finalize.
 *   Open carries the ink rule + ballot-sweep shimmer so an
 *   active vote stands out on a long scroll. Awaiting drops
 *   the rule but keeps the dossier silhouette.
 * ============================================================ */
function SessionCard({
  id,
  title,
  status,
  endBlock,
  remaining,
  totalCost,
  authors,
}: {
  id: number;
  title: string;
  status: "open" | "awaiting";
  endBlock: bigint | undefined;
  remaining: number | null;
  totalCost: number | undefined;
  authors: number | undefined;
}) {
  const isOpen = status === "open";

  return (
    <li>
      <Link
        to="/proposals/$proposalId"
        params={{ proposalId: String(id) }}
        className="group relative block overflow-hidden bg-secondary/40 px-4 py-5 transition-colors hover:bg-accent/40 sm:px-5 sm:py-6"
        style={{
          border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
        }}
      >
        {isOpen ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
              style={{ background: "var(--ink)" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-[3px] [animation:ballot-sweep_2.4s_cubic-bezier(.55,0,.45,1)_infinite]"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, color-mix(in oklch, white 60%, transparent) 50%, transparent 100%)",
              }}
            />
          </>
        ) : null}

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          <span
            className="font-display text-2xl font-[600] tabular-nums sm:text-3xl"
            style={{
              color: isOpen ? "var(--ink)" : "inherit",
              fontVariationSettings: "'opsz' 144, 'SOFT' 0",
            }}
          >
            № {String(id).padStart(2, "0")}
          </span>
          <StatusChip tone={status} />
        </div>

        <h3 className="mt-3 font-serif text-[17px] leading-snug text-foreground sm:text-[18px]">{title}</h3>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {isOpen && remaining !== null ? (
            <span className="text-foreground">
              <span style={{ color: "var(--ink)" }}>●</span> <span>closes in {formatCountdown(remaining)}</span>
            </span>
          ) : !isOpen && endBlock !== undefined ? (
            <span className="text-foreground/80">closed at block {endBlock.toString()}</span>
          ) : null}
          {totalCost !== undefined && totalCost > 0 ? <span>{formatAmount(totalCost)} USDC</span> : null}
          {authors !== undefined ? (
            <span>
              {authors} {authors === 1 ? "author" : "authors"}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function StatusChip({ tone }: { tone: "open" | "awaiting" }) {
  const isOpen = tone === "open";
  return (
    <span
      className="inline-flex select-none items-center whitespace-nowrap px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
      style={{
        border: isOpen ? "1px solid var(--ink)" : "1px solid color-mix(in oklch, currentColor 24%, transparent)",
        color: isOpen ? "var(--ink)" : undefined,
        background: isOpen ? "color-mix(in oklch, var(--ink) 10%, transparent)" : "transparent",
      }}
    >
      {isOpen ? "Voting open" : "Awaiting finalize"}
    </span>
  );
}

function formatAmount(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

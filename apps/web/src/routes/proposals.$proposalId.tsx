import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, zeroAddress, type Address, type Hex } from "viem";
import type { ProposalBody } from "@ipe-gov/ipfs";
import { useClaimedSubnames, useIdentity } from "#/hooks/useIdentity";
import { useAccount, useReadContract } from "wagmi";
import { LiquidDelegationABI, UnlockConfidentialGovernorLiquidABI, addresses } from "@ipe-gov/sdk";
import { encryptVote, publicDecryptHandles } from "../lib/fhevm";
import {
  DELEGATE_BATCH_SIZE,
  useClaimableDelegators,
  useDelegationTargetCheck,
  useIsMember,
  useMyDelegate,
  type DelegationTargetReason,
} from "../hooks/useDelegation";
import { useAllMembers } from "../hooks/useMembers";
import { formatCountdown, useBlockCountdown } from "../hooks/useBlockCountdown";
import { useSponsoredWrite, type WriteParams } from "../hooks/useSponsoredWrite";
import { useProposal, type ProposalHandles } from "../hooks/useProposal";
import { useProposalDescription } from "../hooks/useProposalDescription";
import { truncateAddress } from "#/lib/address";
import RequireUnlockMembership from "#/components/RequireUnlockMembership";
import { Button } from "#/components/ui/button";
import { ArrowLeft } from "lucide-react";

// Same warm sealing-wax ink that anchors the wizard and the list. Scoped to
// this route via inline style on <main> so the rest of the app keeps its
// monochrome ledger palette.
const INK = "oklch(0.55 0.18 35)";

export const Route = createFileRoute("/proposals/$proposalId")({
  head: ({ params }) => ({
    meta: [{ title: `Proposal #${params.proposalId} — ipe-gov` }],
  }),
  component: ProposalPageGuarded,
});

function ProposalPageGuarded() {
  return (
    <RequireUnlockMembership>
      <ProposalPage />
    </RequireUnlockMembership>
  );
}

function ProposalPage() {
  const { proposalId } = Route.useParams();
  const id = BigInt(proposalId);
  const proposal = useProposal(id);
  const { text: description, body, isLoading: descLoading } = useProposalDescription(proposal.descriptionCid);
  const [status, setStatus] = useState<string>("");

  const headline = body?.headline
    ? body.headline
    : description
      ? description
      : descLoading
        ? "Loading description…"
        : `Proposal #${proposalId}`;

  const tone: StatusTone = proposal.finalized ? "finalized" : proposal.votingClosed ? "awaiting" : "open";

  return (
    <main style={{ ["--ink" as string]: INK }} className="relative mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <div className="mb-6 sm:mb-8">
        <Link
          to="/proposals"
          className="group inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground sm:text-[11px]"
        >
          <ArrowLeft aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          The Register
        </Link>
      </div>

      <Hero
        proposalId={proposalId}
        headline={headline}
        tone={tone}
        endBlock={proposal.endBlock}
        finalized={proposal.finalized}
        votingClosed={proposal.votingClosed}
        body={body}
      />

      <section className="mt-10 grid gap-12 sm:mt-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
        {/* Brief on the left at lg+, second on mobile so the action panel
            comes first under the hero. */}
        <div className="min-w-0 lg:order-1">{body ? <Brief body={body} /> : null}</div>

        {/* Action panel — sticky right rail at lg+, ordered first on mobile so
            members land on the ballot before the long brief. */}
        <aside className="order-first lg:order-2 lg:sticky lg:top-24 lg:self-start">
          <ActionPanel id={id} proposal={proposal} onStatusChange={setStatus} status={status} />
        </aside>
      </section>
    </main>
  );
}

/* ============================================================
 * Hero — serial number, headline, status chip, meta strip.
 * ============================================================ */

type StatusTone = "open" | "awaiting" | "finalized";

function Hero({
  proposalId,
  headline,
  tone,
  endBlock,
  finalized,
  votingClosed,
  body,
}: {
  proposalId: string;
  headline: string;
  tone: StatusTone;
  endBlock: bigint | undefined;
  finalized: boolean;
  votingClosed: boolean;
  body: ProposalBody | undefined;
}) {
  const remaining = useBlockCountdown(!finalized && !votingClosed ? endBlock : undefined);

  const totalCost = body?.totalCost;

  return (
    <header className="border-b border-border pb-8 sm:pb-10">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:text-[11px]">
        Motion · Sepolia
      </div>
      <div className="mt-3 grid gap-6 sm:mt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <div
            className="font-display text-[clamp(3.25rem,12vw,5.5rem)] font-[700] leading-[0.9] tabular-nums tracking-[-0.03em]"
            style={{
              color: "var(--ink)",
              fontVariationSettings: "'opsz' 144, 'SOFT' 0",
            }}
          >
            № {String(proposalId).padStart(2, "0")}
          </div>
          <h1 className="mt-4 break-words font-serif text-[1.5rem] leading-snug text-foreground sm:text-[1.75rem] lg:text-[2rem]">
            {headline}
          </h1>
          {body ? <HeroAuthors lead={body.authors.lead} coAuthors={body.authors.coAuthors} /> : null}
        </div>
        <div className="lg:pt-3">
          <DetailStatusChip tone={tone} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]">
        {endBlock !== undefined ? (
          tone === "open" && remaining !== null ? (
            <span className="text-foreground">
              <span style={{ color: "var(--ink)" }}>●</span> <span>closes in {formatCountdown(remaining)}</span>
            </span>
          ) : tone === "awaiting" ? (
            <span className="text-foreground/85">closed at block {endBlock.toString()}</span>
          ) : (
            <span className="text-foreground/70">closed at block {endBlock.toString()}</span>
          )
        ) : null}
        {totalCost !== undefined && totalCost > 0 ? <span>{formatAmount(totalCost)} USDC</span> : null}
      </div>
    </header>
  );
}

/* ============================================================
 * HeroAuthors — lead + co-authors surfaced beneath the headline.
 *   Each name is a clickable link to the member dossier; mono
 *   role labels ("Moved by" / "with") frame the serif names so
 *   the line reads as a printed dedication.
 * ============================================================ */

function HeroAuthors({ lead, coAuthors }: { lead: Address; coAuthors: readonly Address[] }) {
  return (
    <div className="mt-5 flex flex-col flex-wrap items-baseline gap-x-3 gap-y-1.5 sm:flex-row">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Moved by</span>
      <AuthorLink address={lead} />
      {coAuthors.length > 0 ? (
        <>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
            ·
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">with</span>
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {coAuthors.map((a, i) => (
              <span key={a} className="flex items-baseline gap-x-2">
                {i > 0 ? (
                  <span aria-hidden className="font-mono text-[10px] text-muted-foreground/60">
                    ·
                  </span>
                ) : null}
                <AuthorLink address={a} />
              </span>
            ))}
          </span>
        </>
      ) : null}
    </div>
  );
}

function AuthorLink({ address }: { address: Address }) {
  const { data: name } = useIdentity(address);
  return (
    <Link
      to="/members/$address"
      params={{ address }}
      className="group inline-flex items-baseline gap-1.5 transition-colors hover:[color:var(--ink)]"
    >
      <span className="font-serif text-[15px] text-foreground transition-colors group-hover:[color:var(--ink)] sm:text-[16px]">
        {name ?? truncateAddress(address)}
      </span>
      {name ? (
        <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{truncateAddress(address)}</span>
      ) : null}
    </Link>
  );
}

function DetailStatusChip({ tone }: { tone: StatusTone }) {
  const isOpen = tone === "open";
  const isAwaiting = tone === "awaiting";
  const label = tone === "open" ? "Voting open" : tone === "awaiting" ? "Awaiting finalize" : "Finalized";
  return (
    <span
      className="inline-flex select-none items-center whitespace-nowrap px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em]"
      style={{
        border: isOpen
          ? "1px solid var(--ink)"
          : isAwaiting
            ? "1px solid color-mix(in oklch, currentColor 28%, transparent)"
            : "1px solid color-mix(in oklch, currentColor 16%, transparent)",
        color: isOpen ? "var(--ink)" : isAwaiting ? undefined : "var(--muted-foreground)",
        background: isOpen
          ? "color-mix(in oklch, var(--ink) 10%, transparent)"
          : tone === "finalized"
            ? "color-mix(in oklch, currentColor 6%, transparent)"
            : "transparent",
      }}
    >
      {label}
    </span>
  );
}

/* ============================================================
 * Action panel — context-sensitive ballot / finalize / tally.
 *   Preserves the entire dispatch tree from the original
 *   ProposalActions; only the surrounding chrome changes.
 * ============================================================ */

function ActionPanel({
  id,
  proposal,
  onStatusChange,
  status,
}: {
  id: bigint;
  proposal: ReturnType<typeof useProposal>;
  onStatusChange: (s: string) => void;
  status: string;
}) {
  return (
    <div className="space-y-3">
      <ActionDispatch id={id} proposal={proposal} onStatusChange={onStatusChange} />
      {status ? (
        <p role="status" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {status}
        </p>
      ) : null}
    </div>
  );
}

function ActionDispatch({
  id,
  proposal,
  onStatusChange,
}: {
  id: bigint;
  proposal: ReturnType<typeof useProposal>;
  onStatusChange: (s: string) => void;
}) {
  const { isConnected, address } = useAccount();
  const { data: isMember, isLoading: memberLoading } = useIsMember(address);

  if (proposal.isLoading || !proposal.handles) {
    return (
      <InfoCard tag="loading" title="Reading the register">
        Loading…
      </InfoCard>
    );
  }
  if (proposal.finalized) {
    return <Tallies handles={proposal.handles} />;
  }
  if (!isConnected) {
    return (
      <InfoCard tag="locked" title="Cast your ballot">
        Connect a wallet to vote on this motion.
      </InfoCard>
    );
  }
  if (memberLoading) {
    return (
      <InfoCard tag="checking" title="Cast your ballot">
        Checking membership status…
      </InfoCard>
    );
  }
  if (!isMember) {
    return (
      <InfoCard tag="restricted" title="Members only">
        You need a valid Unlock membership key to act on this proposal.
      </InfoCard>
    );
  }
  if (proposal.votingClosed) {
    return <FinalizeAction id={id} onStatusChange={onStatusChange} onDone={proposal.refetch} />;
  }
  return <VoteAction id={id} onStatusChange={onStatusChange} onDone={proposal.refetch} />;
}

/* ============================================================
 * Info card — generic chrome for "loading" / "connect" / etc.
 * ============================================================ */

function InfoCard({ tag, title, children }: { tag: string; title: string; children: ReactNode }) {
  return (
    <div
      className="bg-secondary/40 px-4 py-5 sm:px-5 sm:py-6"
      style={{
        border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <ActionTitle>{title}</ActionTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{tag}</span>
      </div>
      <p className="mt-3 font-serif text-[14px] italic leading-relaxed text-muted-foreground sm:text-[15px]">
        {children}
      </p>
    </div>
  );
}

function ActionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="font-display text-[1.25rem] font-[600] leading-none tracking-tight text-foreground sm:text-[1.4rem]"
      style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0" }}
    >
      {children}
    </h2>
  );
}

/* ============================================================
 * Finalize action
 * ============================================================ */

function FinalizeAction({
  id,
  onStatusChange,
  onDone,
}: {
  id: bigint;
  onStatusChange: (s: string) => void;
  onDone: () => Promise<unknown>;
}) {
  const { mutateAsync: sponsoredWrite, isPending } = useSponsoredWrite();

  async function finalize() {
    onStatusChange("Submitting finalize transaction…");
    try {
      await sponsoredWrite({
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
        functionName: "finalize",
        args: [id],
      });
      onStatusChange("Proposal finalized.");
      await onDone();
    } catch (err) {
      onStatusChange(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <div
      className="bg-secondary/40 px-4 py-5 sm:px-5 sm:py-6"
      style={{
        border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <ActionTitle>Voting closed</ActionTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">ready</span>
      </div>
      <p className="mt-3 font-serif text-[14px] italic leading-relaxed text-muted-foreground sm:text-[15px]">
        Reveal the encrypted tallies by finalizing this proposal.
      </p>
      <Button
        onClick={finalize}
        disabled={isPending}
        size="lg"
        className="mt-5 w-full cursor-pointer font-mono text-[11px] uppercase tracking-[0.2em]"
        style={{ background: "var(--ink)" }}
      >
        {isPending ? "Finalizing…" : "Finalize proposal"}
      </Button>
    </div>
  );
}

/* ============================================================
 * Vote action — preserves all original state / submission
 *   behaviour. Visual chrome only is restyled.
 * ============================================================ */

type BallotStage = "encrypting" | "submitting" | "sealed";
type BallotBusy = { choice: 0 | 1 | 2; stage: BallotStage } | null;

function VoteAction({
  id,
  onStatusChange,
  onDone,
}: {
  id: bigint;
  onStatusChange: (s: string) => void;
  onDone: () => Promise<unknown>;
}) {
  const { address } = useAccount();
  const { mutateAsync: sponsoredWrite, isPending } = useSponsoredWrite();
  const [busy, setBusy] = useState<BallotBusy>(null);
  const { data: alreadyDirectlyVoted, refetch: refetchVoted } = useReadContract({
    address: addresses.sepolia.governorLiquid as Hex,
    abi: UnlockConfidentialGovernorLiquidABI,
    functionName: "hasDirectlyVoted",
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const { data: countedByAddr, refetch: refetchCountedBy } = useReadContract({
    address: addresses.sepolia.governorLiquid as Hex,
    abi: UnlockConfidentialGovernorLiquidABI,
    functionName: "countedBy",
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const { data: myDelegate, refetch: refetchMyDelegate } = useMyDelegate(id, address);
  const claim = useClaimableDelegators(id, address);

  async function refresh() {
    await Promise.all([refetchVoted(), refetchCountedBy(), refetchMyDelegate(), claim.refetch(), onDone()]);
  }

  const hasDelegate = myDelegate && myDelegate !== zeroAddress;
  const hasClaimable = claim.claimable.length > 0;
  const hasExcluded = claim.excluded.length > 0;
  const overflow = claim.claimable.length > DELEGATE_BATCH_SIZE;
  const countedByDelegate = countedByAddr && countedByAddr !== zeroAddress;

  async function castBundled(support: 0 | 1 | 2) {
    if (!address) return;
    const batch = claim.claimable.slice(0, DELEGATE_BATCH_SIZE) as readonly Hex[];
    setBusy({ choice: support, stage: "encrypting" });
    onStatusChange("Encrypting vote…");
    try {
      // Two independent encryptions: FHEVM's inputProof is consumed on first
      // `FHE.fromExternal`, so one ciphertext can't satisfy both calls. Same
      // plaintext, two proofs. Both bound to (governor, voter).
      const [encSelf, encDelegate] = await Promise.all([
        encryptVote(addresses.sepolia.governorLiquid as Hex, address, support),
        hasClaimable ? encryptVote(addresses.sepolia.governorLiquid as Hex, address, support) : Promise.resolve(null),
      ]);
      const calls: WriteParams[] = [];
      if (hasClaimable && encDelegate) {
        calls.push({
          address: addresses.sepolia.governorLiquid as Hex,
          abi: UnlockConfidentialGovernorLiquidABI,
          functionName: "castVoteAsDelegate",
          args: [id, encDelegate.handle, encDelegate.inputProof, batch],
        });
      }
      calls.push({
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
        functionName: "castVote",
        args: [id, encSelf.handle, encSelf.inputProof],
      });
      setBusy({ choice: support, stage: "submitting" });
      onStatusChange("Submitting transaction…");
      await sponsoredWrite(calls);
      setBusy({ choice: support, stage: "sealed" });
      onStatusChange(
        hasClaimable
          ? `Voted and claimed ${batch.length} delegator${batch.length === 1 ? "" : "s"}.`
          : "Vote submitted.",
      );
      await refresh();
    } catch (err) {
      setBusy(null);
      onStatusChange(`Error: ${(err as Error).message}`);
    }
  }

  async function castClaimOnly(support: 0 | 1 | 2) {
    if (!address || !hasClaimable) return;
    const batch = claim.claimable.slice(0, DELEGATE_BATCH_SIZE) as readonly Hex[];
    setBusy({ choice: support, stage: "encrypting" });
    onStatusChange("Encrypting vote…");
    try {
      const enc = await encryptVote(addresses.sepolia.governorLiquid as Hex, address, support);
      setBusy({ choice: support, stage: "submitting" });
      onStatusChange("Submitting transaction…");
      await sponsoredWrite({
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
        functionName: "castVoteAsDelegate",
        args: [id, enc.handle, enc.inputProof, batch],
      });
      setBusy({ choice: support, stage: "sealed" });
      onStatusChange(`Claimed ${batch.length} delegator${batch.length === 1 ? "" : "s"}.`);
      await refresh();
    } catch (err) {
      setBusy(null);
      onStatusChange(`Error: ${(err as Error).message}`);
    }
  }

  let primary: ReactNode;
  if (alreadyDirectlyVoted) {
    primary = <SealedBlock>Your ballot is sealed in this motion.</SealedBlock>;
  } else if (hasDelegate && !countedByDelegate) {
    primary = (
      <DelegationCertificate
        delegate={myDelegate as Hex}
        onRevoke={() => doUndelegate(sponsoredWrite, id, onStatusChange, refresh).catch(() => {})}
        isPending={isPending}
      />
    );
  } else {
    primary = (
      <VoteBlock
        isPending={isPending}
        busy={busy}
        hasClaimable={hasClaimable}
        hasExcluded={hasExcluded}
        countedByDelegate={Boolean(countedByDelegate)}
        countedByAddr={countedByAddr}
        claimableCount={claim.claimable.length}
        excludedCount={claim.excluded.length}
        overflow={overflow}
        onVote={castBundled}
      />
    );
  }

  let secondary: ReactNode = null;
  if (alreadyDirectlyVoted && hasClaimable) {
    secondary = (
      <ClaimOnlyBlock
        isPending={isPending}
        busy={busy}
        claimableCount={claim.claimable.length}
        excludedCount={claim.excluded.length}
        overflow={overflow}
        onClaim={castClaimOnly}
      />
    );
  } else if (!alreadyDirectlyVoted && !hasDelegate) {
    secondary = <DelegatePickerBlock id={id} onStatusChange={onStatusChange} onDone={refresh} />;
  }

  return (
    <div className="space-y-3">
      {primary}
      {secondary}
    </div>
  );
}

async function doUndelegate(
  sponsoredWrite: ReturnType<typeof useSponsoredWrite>["mutateAsync"],
  id: bigint,
  onStatusChange: (s: string) => void,
  refresh: () => Promise<unknown>,
) {
  onStatusChange("Revoking delegation…");
  try {
    await sponsoredWrite({
      address: addresses.sepolia.liquidDelegation as Hex,
      abi: LiquidDelegationABI,
      functionName: "undelegate",
      args: [id],
    });
    onStatusChange("Delegation revoked.");
    await refresh();
  } catch (err) {
    onStatusChange(`Error: ${(err as Error).message}`);
  }
}

/* ============================================================
 * Vote block — three-choice grid with ink-themed buttons.
 * ============================================================ */

function VoteBlock({
  isPending,
  busy,
  hasClaimable,
  hasExcluded,
  countedByDelegate,
  countedByAddr,
  claimableCount,
  excludedCount,
  overflow,
  onVote,
}: {
  isPending: boolean;
  busy: BallotBusy;
  hasClaimable: boolean;
  hasExcluded: boolean;
  countedByDelegate: boolean;
  countedByAddr: Hex | undefined;
  claimableCount: number;
  excludedCount: number;
  overflow: boolean;
  onVote: (support: 0 | 1 | 2) => void;
}) {
  return (
    <div
      className="bg-secondary/40 px-4 py-5 sm:px-5 sm:py-6"
      style={{
        border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <ActionTitle>Cast your ballot</ActionTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          ◆ Encrypted end-to-end
        </span>
      </div>

      {countedByDelegate && countedByAddr ? (
        <Notice>
          Your vote was already cast by{" "}
          <code className="font-mono not-italic text-foreground/85">{truncateAddress(countedByAddr)}</code>. Casting
          below overrides that.
        </Notice>
      ) : null}

      {hasClaimable ? (
        <Notice>
          <BundledVoteDescription claimableCount={claimableCount} excludedCount={excludedCount} overflow={overflow} />
        </Notice>
      ) : hasExcluded ? (
        <Notice muted>
          {excludedCount} of your delegator
          {excludedCount === 1 ? " has" : "s have"} already voted directly — only your own vote will be cast.
        </Notice>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        {(
          [
            { label: "For", index: 1, primary: true },
            { label: "Against", index: 0, primary: false },
            { label: "Abstain", index: 2, primary: false },
          ] as const
        ).map((c) => (
          <ChoiceButton
            key={c.index}
            label={c.label}
            index={c.index}
            onClick={() => onVote(c.index)}
            disabled={isPending || busy !== null}
            primary={c.primary}
            busyStage={busy?.choice === c.index ? busy.stage : undefined}
            dimmed={busy !== null && busy.choice !== c.index}
          />
        ))}
      </div>
    </div>
  );
}

function Notice({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <p
      className={`mt-4 border-l-[3px] pl-4 font-serif text-[13px] italic leading-relaxed sm:text-[14px] ${
        muted ? "text-muted-foreground" : "text-foreground/85"
      }`}
      style={{
        borderLeftColor: muted ? "color-mix(in oklch, currentColor 16%, transparent)" : "var(--ink)",
      }}
    >
      {children}
    </p>
  );
}

/* ============================================================
 * Choice button — three states: idle / busy (animated) / dim.
 *   Busy state pulls the same ballot-sweep keyframe used by the
 *   wizard's progress rail and the list's open cards.
 * ============================================================ */

function ChoiceButton({
  label,
  index,
  onClick,
  disabled,
  primary,
  busyStage,
  dimmed,
}: {
  label: string;
  index: 0 | 1 | 2;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
  busyStage?: BallotStage;
  dimmed?: boolean;
}) {
  const topLabel = busyStage ?? (index === 1 ? "yea" : index === 0 ? "nay" : "abstain");

  // Three visual states: idle (default), busy/active, dimmed (sibling busy).
  const idleStyle: React.CSSProperties = primary
    ? {
        border: "1px solid var(--ink)",
        background: "color-mix(in oklch, var(--ink) 10%, transparent)",
        color: "var(--ink)",
      }
    : {
        border: "1px solid color-mix(in oklch, currentColor 24%, transparent)",
        background: "transparent",
      };
  const activeStyle: React.CSSProperties = primary
    ? {
        border: "1px solid var(--ink)",
        background: "var(--ink)",
        color: "var(--primary-foreground)",
      }
    : {
        border: "1px solid color-mix(in oklch, currentColor 60%, transparent)",
        background: "color-mix(in oklch, currentColor 6%, transparent)",
      };
  const dimStyle: React.CSSProperties = {
    border: "1px solid color-mix(in oklch, currentColor 10%, transparent)",
    background: "transparent",
    opacity: 0.35,
  };
  const style = busyStage ? activeStyle : dimmed ? dimStyle : idleStyle;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={Boolean(busyStage)}
      className="group relative flex cursor-pointer flex-col items-start gap-2 overflow-hidden px-4 py-3 text-left transition-all duration-300 disabled:cursor-not-allowed sm:gap-3 sm:px-5 sm:py-4"
      style={style}
    >
      {busyStage && busyStage !== "sealed" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-full [animation:ballot-sweep_1.8s_cubic-bezier(.55,0,.45,1)_infinite]"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, transparent 38%, color-mix(in oklch, white 60%, transparent) 50%, transparent 62%, transparent 100%)",
          }}
        />
      ) : null}

      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] opacity-80">
        {busyStage ? (
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rotate-45 ${
              busyStage === "sealed" ? "" : "[animation:ballot-pulse_1.2s_ease-in-out_infinite]"
            }`}
            style={{ background: "currentColor" }}
          />
        ) : null}
        <span>{topLabel}</span>
      </span>

      <span
        className="font-display text-[1.5rem] font-[600] leading-none tracking-tight sm:text-[1.75rem]"
        style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0" }}
      >
        {label}
      </span>

      {busyStage ? (
        <span aria-hidden className="flex gap-1 font-mono text-[10px] leading-none tracking-[0.28em]">
          {([0, 1, 2] as const).map((i) => {
            const filled = i < (busyStage === "encrypting" ? 1 : busyStage === "submitting" ? 2 : 3);
            return (
              <span key={i} className={`transition-opacity duration-300 ${filled ? "opacity-100" : "opacity-25"}`}>
                ◆
              </span>
            );
          })}
        </span>
      ) : null}
    </button>
  );
}

/* ============================================================
 * Delegation certificate, sealed block, claim-only block.
 * ============================================================ */

function DelegationCertificate({
  delegate,
  onRevoke,
  isPending,
}: {
  delegate: Hex;
  onRevoke: () => void;
  isPending: boolean;
}) {
  const { data: name } = useIdentity(delegate);
  return (
    <div
      className="relative bg-secondary/40 px-4 py-5 sm:px-5 sm:py-6"
      style={{
        border: "1px solid var(--ink)",
        background: "color-mix(in oklch, var(--ink) 6%, transparent)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <ActionTitle>Delegation active</ActionTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--ink)" }}>
          held
        </span>
      </div>
      <div className="mt-4 space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Your ballot is held by
        </div>
        <div className="font-serif text-[17px] text-foreground sm:text-[18px]">{name ?? truncateAddress(delegate)}</div>
        {name ? <div className="font-mono text-[11px] text-muted-foreground">{truncateAddress(delegate)}</div> : null}
      </div>
      <p className="mt-4 font-serif text-[13px] italic leading-relaxed text-muted-foreground sm:text-[14px]">
        They&rsquo;ll cast your vote on this motion. Revoke to reclaim it and vote yourself.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={onRevoke}
        disabled={isPending}
        className="mt-5 cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em]"
      >
        Revoke delegation
      </Button>
    </div>
  );
}

function SealedBlock({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative bg-secondary/40 px-4 py-5 text-center sm:px-5 sm:py-6"
      style={{
        border: "1px solid var(--ink)",
        background: "color-mix(in oklch, var(--ink) 6%, transparent)",
      }}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: "var(--ink)" }}>
        Ballot sealed
      </div>
      <p className="mt-3 font-serif text-[16px] leading-snug text-foreground sm:text-[17px]">{children}</p>
    </div>
  );
}

function ClaimOnlyBlock({
  isPending,
  busy,
  claimableCount,
  excludedCount,
  overflow,
  onClaim,
}: {
  isPending: boolean;
  busy: BallotBusy;
  claimableCount: number;
  excludedCount: number;
  overflow: boolean;
  onClaim: (support: 0 | 1 | 2) => void;
}) {
  return (
    <div
      className="bg-secondary/40 px-4 py-5 sm:px-5 sm:py-6"
      style={{
        border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
      }}
    >
      <ActionTitle>Delegated voting power remains</ActionTitle>
      <p className="mt-3 font-serif text-[13px] italic leading-relaxed text-muted-foreground sm:text-[14px]">
        <DelegatorClaimDescription claimableCount={claimableCount} excludedCount={excludedCount} overflow={overflow} />
      </p>
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        {(
          [
            { label: "Claim · For", index: 1 },
            { label: "Claim · Against", index: 0 },
            { label: "Claim · Abstain", index: 2 },
          ] as const
        ).map((c) => (
          <ChoiceButton
            key={c.index}
            label={c.label}
            index={c.index}
            onClick={() => onClaim(c.index)}
            disabled={isPending || busy !== null}
            busyStage={busy?.choice === c.index ? busy.stage : undefined}
            dimmed={busy !== null && busy.choice !== c.index}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
 * Delegate picker block — find a member to hold your vote.
 * ============================================================ */

function DelegatePickerBlock({
  id,
  onStatusChange,
  onDone,
}: {
  id: bigint;
  onStatusChange: (s: string) => void;
  onDone: () => Promise<unknown>;
}) {
  const { address } = useAccount();
  const [addr, setAddr] = useState("");
  const { mutateAsync: sponsoredWrite, isPending } = useSponsoredWrite();
  const { data: members = [], isLoading: membersLoading } = useAllMembers();
  const { data: subnames } = useClaimedSubnames();
  const owners = useMemo(() => members.map((m) => m.owner), [members]);
  // `all` is the caller's transitive reverse-delegation set — delegating to
  // any of them would cycle. Wagmi dedupes this read with the one in
  // VoteAction's useClaimableDelegators, so calling it here is free.
  const myTransitive = useClaimableDelegators(id, address);
  const cycleSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of myTransitive.all) s.add(d.toLowerCase());
    return s;
  }, [myTransitive.all]);

  const normalized = isAddress(addr) ? (addr as Hex) : undefined;
  const check = useDelegationTargetCheck(id, address, normalized);
  const targetError = describeDelegationReason(check.reason);

  const filteredMembers = useMemo(() => {
    const self = address?.toLowerCase();
    const query = addr.trim().toLowerCase();
    const rows = owners
      .filter((owner) => {
        const lower = owner.toLowerCase();
        if (self && lower === self) return false;
        if (cycleSet.has(lower)) return false;
        return true;
      })
      .map((owner) => ({ owner, name: subnames?.get(owner.toLowerCase()) }));
    const matched =
      query.length === 0
        ? rows
        : rows.filter(
            (r) => r.owner.toLowerCase().includes(query) || (r.name ? r.name.toLowerCase().includes(query) : false),
          );
    matched.sort((a, b) => {
      if (!!a.name === !!b.name) {
        return (a.name ?? a.owner).localeCompare(b.name ?? b.owner);
      }
      return a.name ? -1 : 1;
    });
    return matched.map((r) => r.owner);
  }, [owners, subnames, address, addr, cycleSet]);

  async function doDelegate() {
    if (!normalized) {
      onStatusChange("Invalid address.");
      return;
    }
    if (!check.ok) {
      onStatusChange(targetError ?? "Cannot delegate to that address.");
      return;
    }
    onStatusChange("Submitting delegation…");
    try {
      await sponsoredWrite({
        address: addresses.sepolia.liquidDelegation as Hex,
        abi: LiquidDelegationABI,
        functionName: "delegate",
        args: [id, normalized],
      });
      onStatusChange("Delegation set.");
      setAddr("");
      await onDone();
    } catch (err) {
      onStatusChange(`Error: ${(err as Error).message}`);
    }
  }

  const checking = Boolean(normalized) && check.isLoading;
  const buttonDisabled = isPending || !normalized || checking || !check.ok;
  const selectedLower = normalized?.toLowerCase();

  const idle = "color-mix(in oklch, currentColor 16%, transparent)";

  return (
    <div className="bg-secondary/40 px-4 py-5 sm:px-5 sm:py-6" style={{ border: `1px solid ${idle}` }}>
      <div className="flex items-baseline justify-between gap-3">
        <ActionTitle>Or delegate your vote</ActionTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          per-proposal · revocable
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          placeholder="Search name or paste 0x…"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          spellCheck={false}
          className="flex-1 bg-background px-3 py-2 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground"
          style={{ border: `1px solid ${idle}` }}
        />
        <Button
          onClick={doDelegate}
          disabled={buttonDisabled}
          variant="outline"
          className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em]"
        >
          Delegate
        </Button>
      </div>

      {addr && !normalized ? (
        <p className="mt-3 border-l-[3px] border-destructive pl-3 font-serif text-[12px] italic text-destructive sm:text-[13px]">
          Not a valid 0x address.
        </p>
      ) : checking ? (
        <p
          className="mt-3 border-l-[3px] pl-3 font-serif text-[12px] italic text-muted-foreground sm:text-[13px]"
          style={{ borderLeftColor: idle }}
        >
          Checking target…
        </p>
      ) : targetError ? (
        <p className="mt-3 border-l-[3px] border-destructive pl-3 font-serif text-[12px] italic text-destructive sm:text-[13px]">
          {targetError}
        </p>
      ) : null}

      <div className="mt-4">
        <MemberPickerList
          isLoading={membersLoading}
          totalOwners={owners.length}
          filtered={filteredMembers}
          selectedLower={selectedLower}
          onPick={setAddr}
        />
      </div>
    </div>
  );
}

function MemberPickerList({
  isLoading,
  totalOwners,
  filtered,
  selectedLower,
  onPick,
}: {
  isLoading: boolean;
  totalOwners: number;
  filtered: readonly Hex[];
  selectedLower: string | undefined;
  onPick: (addr: Hex) => void;
}) {
  const idle = "color-mix(in oklch, currentColor 16%, transparent)";
  if (isLoading) {
    return <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Loading members…</p>;
  }
  if (totalOwners === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        No members yet — paste an address to delegate.
      </p>
    );
  }
  if (filtered.length === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">No matching members.</p>
    );
  }
  return (
    <ul className="max-h-64 overflow-y-auto bg-background" style={{ border: `1px solid ${idle}` }}>
      {filtered.map((owner, i) => (
        <li key={owner} style={i > 0 ? { borderTop: `1px solid ${idle}` } : undefined}>
          <DelegatePickerRow owner={owner} isSelected={selectedLower === owner.toLowerCase()} onPick={onPick} />
        </li>
      ))}
    </ul>
  );
}

function DelegatePickerRow({
  owner,
  isSelected,
  onPick,
}: {
  owner: Hex;
  isSelected: boolean;
  onPick: (addr: Hex) => void;
}) {
  const { data: name } = useIdentity(owner);
  return (
    <button
      type="button"
      onClick={() => onPick(owner)}
      className={`group flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
        isSelected ? "bg-accent text-foreground" : "text-foreground/85 hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      <span className="flex min-w-0 items-baseline gap-3">
        <span className="truncate font-serif text-[15px]">{name ?? truncateAddress(owner)}</span>
        {name ? (
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {truncateAddress(owner)}
          </span>
        ) : null}
      </span>
      {isSelected ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--ink)" }}>
          selected
        </span>
      ) : null}
    </button>
  );
}

/* ============================================================
 * Tallies — finalized hero. Three columns at sm+, stacked on
 *   phones. Winning side is ink-painted with a cap rule.
 * ============================================================ */

function Tallies({ handles }: { handles: ProposalHandles }) {
  const {
    data: values,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tallies", handles.forVotes, handles.againstVotes, handles.abstainVotes],
    queryFn: () => publicDecryptHandles([handles.forVotes, handles.againstVotes, handles.abstainVotes]),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div
        className="bg-secondary/40 px-4 py-12 text-center sm:px-5"
        style={{
          border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
        }}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Decrypting tallies…
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="bg-secondary/40 px-4 py-5 sm:px-5 sm:py-6"
        style={{
          border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
        }}
      >
        <ActionTitle>Final tally</ActionTitle>
        <p className="mt-3 border-l-[3px] border-destructive pl-3 font-serif text-[13px] italic text-destructive sm:text-[14px]">
          Failed to decrypt: {(error as Error).message}
        </p>
      </div>
    );
  }
  if (!values) return null;

  const [forVotes, againstVotes, abstainVotes] = values;
  const rows = [
    { label: "For", value: forVotes, key: "for" },
    { label: "Against", value: againstVotes, key: "against" },
    { label: "Abstain", value: abstainVotes, key: "abstain" },
  ] as const;
  const max = rows.reduce((m, r) => (r.value > m ? r.value : m), 0n);

  return (
    <div
      className="bg-secondary/40 px-4 py-5 sm:px-5 sm:py-6"
      style={{
        border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <ActionTitle>Final tally</ActionTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">via Zama FHEVM</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden">
        {rows.map((r) => {
          const isMax = max > 0n && r.value === max;
          return (
            <div
              key={r.key}
              className="flex flex-col items-center gap-2 bg-background py-6 sm:py-8"
              style={{
                background: isMax ? "color-mix(in oklch, var(--ink) 8%, transparent)" : undefined,
              }}
            >
              <div
                className="font-mono text-[10px] uppercase tracking-[0.22em]"
                style={{ color: isMax ? "var(--ink)" : undefined }}
              >
                {r.label}
              </div>
              <div
                className="font-display text-[2.25rem] font-[700] leading-none tabular-nums sm:text-[3rem]"
                style={{
                  color: isMax ? "var(--ink)" : "var(--muted-foreground)",
                  fontVariationSettings: "'opsz' 144, 'SOFT' 0",
                }}
              >
                {r.value.toString()}
              </div>
              <div
                className="h-[2px] w-8 transition-colors"
                style={{ background: isMax ? "var(--ink)" : "transparent" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 * Brief — port of the wizard's authored-content sections.
 * ============================================================ */

function Brief({ body }: { body: ProposalBody }) {
  // Not all sections are present for every motion — render only those with
  // content so the brief stays tight.
  const sections: Array<{ tag: string; node: ReactNode }> = [];
  if (body.problem)
    sections.push({
      tag: "I",
      node: (
        <BriefSection tag="I" title="Problem" hint="Quantify where possible.">
          <BriefProse>{body.problem}</BriefProse>
        </BriefSection>
      ),
    });
  if (body.solution)
    sections.push({
      tag: "II",
      node: (
        <BriefSection tag="II" title="Solution" hint="Action authorised.">
          <BriefProse>{body.solution}</BriefProse>
        </BriefSection>
      ),
    });
  if (body.outcomes)
    sections.push({
      tag: "III",
      node: (
        <BriefSection tag="III" title="Outcomes" hint="How the assembly will know.">
          <BriefProse>{body.outcomes}</BriefProse>
        </BriefSection>
      ),
    });
  if (body.costs.length > 0)
    sections.push({
      tag: "IV",
      node: (
        <BriefSection tag="IV" title="Cost breakdown" hint={`${formatAmount(body.totalCost)} USDC`}>
          <CostLedger costs={body.costs} totalCost={body.totalCost} />
        </BriefSection>
      ),
    });
  if (body.milestones.length > 0)
    sections.push({
      tag: "V",
      node: (
        <BriefSection tag="V" title="Funding milestones" hint="Release schedule.">
          <Milestones milestones={body.milestones} />
        </BriefSection>
      ),
    });
  if (body.credentials)
    sections.push({
      tag: "VI",
      node: (
        <BriefSection tag="VI" title="Credentials" hint="Prior work cited by the authors.">
          <BriefProse>{body.credentials}</BriefProse>
        </BriefSection>
      ),
    });

  return (
    <article className="space-y-12 sm:space-y-14">
      {sections.map((s) => (
        <div key={s.tag}>{s.node}</div>
      ))}
    </article>
  );
}

function BriefSection({
  tag,
  title,
  hint,
  children,
}: {
  tag: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <SectionHead tag={tag} title={title} hint={hint} />
      <div className="mt-5">{children}</div>
    </section>
  );
}

// Mirrors the wizard's SectionHead. Local copy keeps this PR scoped; if the
// pattern grows beyond two routes, extract it into a shared primitive.
function SectionHead({ tag, title, hint }: { tag: string; title: string; hint?: string }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="flex items-end gap-3 sm:gap-4">
        <span
          className="inline-flex h-7 min-w-[2.25rem] items-center justify-center px-2 font-mono text-[11px] uppercase tracking-[0.2em] tabular-nums sm:h-8 sm:min-w-[2.5rem]"
          style={{
            border: "1.5px solid var(--ink)",
            color: "var(--ink)",
            background: "color-mix(in oklch, var(--ink) 10%, transparent)",
          }}
        >
          {tag}
        </span>
        <h3
          className="font-display text-[1.5rem] font-[600] leading-none tracking-tight text-foreground sm:text-[1.75rem]"
          style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0" }}
        >
          {title}
        </h3>
      </div>
      {hint ? (
        <span className="hidden max-w-[18rem] text-right font-serif text-[12px] italic leading-tight text-muted-foreground sm:inline">
          {hint}
        </span>
      ) : null}
    </header>
  );
}

function BriefProse({ children }: { children: string }) {
  return (
    <div
      className="whitespace-pre-wrap bg-secondary/40 p-4 font-serif text-[15px] leading-relaxed text-foreground sm:p-5 sm:text-[17px]"
      style={{
        border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
      }}
    >
      {children}
    </div>
  );
}

/* ============================================================
 * Cost ledger + milestones + authors (read-only).
 * ============================================================ */

function CostLedger({ costs, totalCost }: { costs: ProposalBody["costs"]; totalCost: number }) {
  return (
    <div className="space-y-2">
      {costs.map((c, i) => (
        <div
          key={i}
          className="flex flex-col gap-1.5 bg-secondary/40 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:py-2"
          style={{
            border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
          }}
        >
          <span className="min-w-0 flex-1 font-serif text-[15px] text-foreground sm:text-[16px]">{c.item || "—"}</span>
          <div className="flex items-baseline justify-end gap-3 sm:shrink-0">
            <span className="w-24 text-right font-mono text-[14px] tabular-nums text-foreground">
              {c.amount || "0"}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">USDC</span>
          </div>
        </div>
      ))}
      <div className="flex items-end justify-end gap-3 py-3">
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground">Total</div>
          <div
            className="font-display text-2xl tabular-nums sm:text-3xl"
            style={{
              color: totalCost > 0 ? "var(--ink)" : "inherit",
              fontVariationSettings: "'opsz' 144, 'SOFT' 0",
            }}
          >
            {formatAmount(totalCost)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Milestones({ milestones }: { milestones: ProposalBody["milestones"] }) {
  return (
    <ol className="space-y-2">
      {milestones.map((m, i) => (
        <li
          key={i}
          className="space-y-2 bg-secondary/40 px-3 py-3"
          style={{
            border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[12px] uppercase tracking-[0.2em] tabular-nums text-foreground">
              {m.label || `M${i + 1}`}
            </span>
            {m.date ? (
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{m.date}</span>
            ) : null}
          </div>
          <div className="font-serif text-[15px] text-foreground sm:text-[16px]">{m.detail || "—"}</div>
          {m.amount ? (
            <div className="flex items-baseline justify-end gap-2">
              <span className="font-mono text-[14px] tabular-nums text-foreground">{m.amount}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">USDC</span>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/* ============================================================
 * Helpers (preserved from the original).
 * ============================================================ */

function BundledVoteDescription({
  claimableCount,
  excludedCount,
  overflow,
}: {
  claimableCount: number;
  excludedCount: number;
  overflow: boolean;
}) {
  const claimed = overflow ? DELEGATE_BATCH_SIZE : claimableCount;
  const remaining = overflow ? claimableCount - DELEGATE_BATCH_SIZE : 0;
  const excluded =
    excludedCount > 0
      ? ` ${excludedCount} delegator${excludedCount === 1 ? " has" : "s have"} already voted directly and won't be included.`
      : "";
  const remainder = remaining > 0 ? ` Click again after this batch lands to claim the remaining ${remaining}.` : "";
  return (
    <>
      Your vote + {claimed} delegator vote{claimed === 1 ? "" : "s"} will be cast together.{excluded}
      {remainder}
    </>
  );
}

function DelegatorClaimDescription({
  claimableCount,
  excludedCount,
  overflow,
}: {
  claimableCount: number;
  excludedCount: number;
  overflow: boolean;
}) {
  if (claimableCount === 0 && excludedCount > 0) {
    return (
      <>
        All {excludedCount} of your delegator
        {excludedCount === 1 ? " has" : "s have"} already voted directly — nothing to claim.
      </>
    );
  }
  const claimLine = overflow
    ? `${DELEGATE_BATCH_SIZE} of ${claimableCount} delegators will be claimed in this batch — re-run after it lands to claim the rest.`
    : `${claimableCount} delegator${claimableCount === 1 ? "" : "s"} ready to claim.`;
  const excludedLine = excludedCount > 0 ? ` ${excludedCount} already voted directly and won't be included.` : "";
  return (
    <>
      {claimLine}
      {excludedLine}
    </>
  );
}

function describeDelegationReason(reason: DelegationTargetReason | undefined): string | null {
  switch (reason) {
    case "self":
      return "Cannot delegate to yourself.";
    case "non-member":
      return "Target does not hold an Unlock membership key.";
    case "cycle":
      return "That would create a delegation cycle on this proposal.";
    case "too-deep":
      return "Delegation chain would exceed the maximum depth.";
    default:
      return null;
  }
}

function formatAmount(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createContext, useEffect, useMemo, useState, use, type ReactNode } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import {
  UnlockConfidentialGovernorLiquidABI,
  addresses,
  MAX_VOTING_PERIOD_BLOCKS,
  MIN_VOTING_PERIOD_BLOCKS,
  SEPOLIA_BLOCK_TIME_SECONDS,
} from "@ipe-gov/sdk";
import type { ProposalBody } from "@ipe-gov/ipfs";
import { useSponsoredWrite } from "../hooks/useSponsoredWrite";
import { buildPinMessage, hashBody, pinDescription } from "../lib/pinApi";
import { useAllMembers } from "../hooks/useMembers";
import { useClaimedSubnames, useIdentity, useIpecitySubnames } from "#/hooks/useIdentity";
import { truncateAddress } from "#/lib/address";
import RequireUnlockMembership from "#/components/RequireUnlockMembership";
import { Button } from "#/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "#/components/ui/sheet";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/proposals/new")({
  head: () => ({ meta: [{ title: "Draft a motion — ipe-gov" }] }),
  component: NewProposalGuarded,
});

function NewProposalGuarded() {
  return (
    <RequireUnlockMembership>
      <DraftProvider>
        <Wizard />
      </DraftProvider>
    </RequireUnlockMembership>
  );
}

/* ============================================================
 * Constants
 * ============================================================ */

// A warm sealing-wax ink colour anchors the chapter numerals, the active-step
// shimmer, and the FILED stamp. Scoped to this route via inline style on the
// <main> element so the rest of the app keeps its monochrome ledger palette.
const INK = "oklch(0.55 0.18 35)";
const HEADLINE_MAX = 160;

// Default voting window — 7 days. Stored as hours so the form can mix
// fractional presets (e.g. 10-minute smoke-test) with multi-day options.
const DEFAULT_VOTING_DURATION_HOURS = 168;

const VOTING_PRESETS: ReadonlyArray<{ label: string; hours: number; note?: string }> = [
  { label: "10 min", hours: 10 / 60, note: "smoke test" },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168, note: "default" },
  { label: "14 days", hours: 336 },
];

function hoursToBlocks(hours: number): number {
  return Math.round((hours * 3600) / SEPOLIA_BLOCK_TIME_SECONDS);
}

function blocksToHours(blocks: number): number {
  return (blocks * SEPOLIA_BLOCK_TIME_SECONDS) / 3600;
}

const MIN_VOTING_DURATION_HOURS = blocksToHours(MIN_VOTING_PERIOD_BLOCKS);
const MAX_VOTING_DURATION_HOURS = blocksToHours(MAX_VOTING_PERIOD_BLOCKS);

const PASSAGE: ReadonlyArray<{
  key: Exclude<Phase, "idle" | "error">;
  label: string;
}> = [
  { key: "signing", label: "Sign intent" },
  { key: "pinning", label: "Pin to IPFS" },
  { key: "submitting", label: "Record on-chain" },
  { key: "done", label: "Entered" },
];

type Chapter = {
  id: ChapterId;
  num: string;
  name: string;
  tagline: string;
};

const CHAPTERS: ReadonlyArray<Chapter> = [
  { id: "motion", num: "01", name: "Motion", tagline: "A single decisive headline" },
  { id: "case", num: "02", name: "Case", tagline: "Problem · solution · outcomes" },
  { id: "ledger", num: "03", name: "Ledger", tagline: "Funding & milestones" },
  { id: "voices", num: "04", name: "Voices", tagline: "Authors who stand behind it" },
  { id: "seal", num: "05", name: "Seal", tagline: "Review & file the motion" },
];

/* ============================================================
 * Types
 * ============================================================ */

type Phase = "idle" | "signing" | "pinning" | "submitting" | "done" | "error";
type ChapterId = "motion" | "case" | "ledger" | "voices" | "seal";
type CostLine = { id: string; item: string; amount: string };
type Milestone = {
  id: string;
  label: string;
  date: string;
  amount: string;
  detail: string;
};

/* ============================================================
 * DraftContext — generic { state, actions, meta } interface.
 *   Any provider that implements this contract can power the
 *   wizard. For now we ship one implementation (DraftProvider)
 *   with local React state, but the UI never depends on it.
 * ============================================================ */

interface DraftState {
  headline: string;
  problem: string;
  solution: string;
  outcomes: string;
  credentials: string;
  costs: CostLine[];
  milestones: Milestone[];
  coAuthors: Address[];
  votingDurationHours: number;
  phase: Phase;
  error: string | null;
  chapterIdx: number;
  drawerOpen: boolean;
}

interface DraftActions {
  setHeadline: (v: string) => void;
  setProblem: (v: string) => void;
  setSolution: (v: string) => void;
  setOutcomes: (v: string) => void;
  setCredentials: (v: string) => void;

  addCost: () => void;
  updateCost: (id: string, patch: Partial<CostLine>) => void;
  removeCost: (id: string) => void;

  addMilestone: () => void;
  updateMilestone: (id: string, patch: Partial<Milestone>) => void;
  removeMilestone: (id: string) => void;

  addCoAuthor: (a: Address) => void;
  removeCoAuthor: (a: Address) => void;

  setVotingDurationHours: (h: number) => void;

  setDrawerOpen: (open: boolean) => void;
  gotoChapter: (idx: number) => void;
  gotoNext: () => void;
  gotoPrev: () => void;
  submit: () => void;
}

interface DraftMeta {
  address: Address | undefined;
  isConnected: boolean;
  busy: boolean;
  totalCost: number;
  filledCostsCount: number;
  filledMilestonesCount: number;
  headlineTrim: string;
  headlineOver: boolean;
  valid: Record<ChapterId, boolean>;
  allValid: boolean;
  votingDurationBlocks: number;
  votingDurationValid: boolean;
  isLast: boolean;
  currentChapter: Chapter;
  canAdvance: boolean;
  canBack: boolean;
}

interface DraftContextValue {
  state: DraftState;
  actions: DraftActions;
  meta: DraftMeta;
}

const DraftContext = createContext<DraftContextValue | null>(null);

function useDraft(): DraftContextValue {
  const ctx = use(DraftContext);
  if (!ctx) throw new Error("useDraft must be used within a DraftProvider");
  return ctx;
}

/* ============================================================
 * DraftProvider — concrete implementation. Owns React state,
 *   computes derived values, drives the on-chain submission.
 *   The provider is the only place that knows HOW state is
 *   managed; every UI component reads through DraftContext.
 * ============================================================ */

function DraftProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { mutateAsync: sponsoredWrite } = useSponsoredWrite();

  const [headline, setHeadline] = useState("");
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState("");
  const [outcomes, setOutcomes] = useState("");
  const [credentials, setCredentials] = useState("");
  const [costs, setCosts] = useState<CostLine[]>([{ id: newId(), item: "", amount: "" }]);
  const [milestones, setMilestones] = useState<Milestone[]>([
    { id: newId(), label: "M1", date: "", amount: "", detail: "" },
  ]);
  const [coAuthors, setCoAuthors] = useState<Address[]>([]);
  const [votingDurationHours, setVotingDurationHours] = useState<number>(DEFAULT_VOTING_DURATION_HOURS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // — derived meta —

  const headlineTrim = headline.trim();
  const headlineOver = headline.length > HEADLINE_MAX;
  const busy = phase === "signing" || phase === "pinning" || phase === "submitting";

  const totalCost = useMemo(
    () =>
      costs.reduce((acc, c) => {
        const n = Number(c.amount);
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0),
    [costs],
  );
  const filledCostLines = useMemo(
    () => costs.filter((c) => c.item.trim() && c.amount.trim() && Number(c.amount) > 0),
    [costs],
  );
  const filledMilestones = useMemo(
    () => milestones.filter((m) => m.date || m.amount.trim() || m.detail.trim()),
    [milestones],
  );

  const costsValid = filledCostLines.length === 0 || totalCost > 0;
  const timelineRequired = filledCostLines.length > 0;

  const votingDurationBlocks = hoursToBlocks(votingDurationHours);
  const votingDurationValid =
    Number.isFinite(votingDurationHours) &&
    votingDurationBlocks >= MIN_VOTING_PERIOD_BLOCKS &&
    votingDurationBlocks <= MAX_VOTING_PERIOD_BLOCKS;

  const valid: Record<ChapterId, boolean> = {
    motion: headlineTrim.length > 0 && !headlineOver,
    case: problem.trim().length >= 40 && solution.trim().length >= 40 && outcomes.trim().length >= 40,
    ledger: costsValid && (!timelineRequired || filledMilestones.length > 0),
    voices: !!address && isConnected,
    seal: votingDurationValid,
  };
  const allValid = valid.motion && valid.case && valid.ledger && valid.voices && !busy;

  const isLast = chapterIdx === CHAPTERS.length - 1;
  const currentChapter = CHAPTERS[chapterIdx];
  const canAdvance = valid[currentChapter.id] && !busy;
  const canBack = chapterIdx > 0 && !busy;

  // — actions —

  async function submit() {
    if (!address || !allValid) return;
    setError(null);
    try {
      const structured: ProposalBody = {
        schema: "ipe-gov.proposal-body/1",
        headline: headlineTrim,
        problem: problem.trim(),
        solution: solution.trim(),
        outcomes: outcomes.trim(),
        credentials: credentials.trim() || undefined,
        costs: filledCostLines.map((c) => ({
          item: c.item.trim(),
          amount: c.amount.trim(),
        })),
        totalCost,
        milestones: filledMilestones.map((m) => ({
          label: m.label.trim(),
          date: m.date,
          amount: m.amount.trim(),
          detail: m.detail.trim(),
        })),
        authors: { lead: address, coAuthors },
      };

      setPhase("signing");
      const message = buildPinMessage(address, Date.now(), hashBody(structured));
      const signature = await signMessageAsync({ message });

      setPhase("pinning");
      const { cid } = await pinDescription({
        data: {
          text: headlineTrim,
          address,
          signature,
          message,
          body: structured,
        },
      });

      setPhase("submitting");
      await sponsoredWrite({
        address: addresses.sepolia.governorLiquid as Hex,
        abi: UnlockConfidentialGovernorLiquidABI,
        functionName: "propose",
        args: [cid, BigInt(votingDurationBlocks)],
      });

      setPhase("done");
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
    }
  }

  useEffect(() => {
    if (phase !== "done") return;
    const id = setTimeout(() => router.navigate({ to: "/proposals" }), 1200);
    return () => clearTimeout(id);
  }, [phase, router]);

  const actions: DraftActions = {
    setHeadline,
    setProblem,
    setSolution,
    setOutcomes,
    setCredentials,

    addCost: () => setCosts((cs) => [...cs, { id: newId(), item: "", amount: "" }]),
    updateCost: (id, patch) => setCosts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    removeCost: (id) => setCosts((cs) => (cs.length === 1 ? cs : cs.filter((c) => c.id !== id))),

    addMilestone: () =>
      setMilestones((ms) => [
        ...ms,
        {
          id: newId(),
          label: `M${ms.length + 1}`,
          date: "",
          amount: "",
          detail: "",
        },
      ]),
    updateMilestone: (id, patch) => setMilestones((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m))),
    removeMilestone: (id) => setMilestones((ms) => (ms.length === 1 ? ms : ms.filter((m) => m.id !== id))),

    addCoAuthor: (a) => setCoAuthors((xs) => (xs.includes(a) ? xs : [...xs, a])),
    removeCoAuthor: (a) => setCoAuthors((xs) => xs.filter((x) => x !== a)),

    setVotingDurationHours,

    setDrawerOpen,
    gotoChapter: (i) => {
      if (busy) return;
      setChapterIdx(Math.max(0, Math.min(CHAPTERS.length - 1, i)));
    },
    gotoNext: () => {
      if (busy || !canAdvance) return;
      if (isLast) {
        submit();
        return;
      }
      setChapterIdx((i) => Math.min(CHAPTERS.length - 1, i + 1));
    },
    gotoPrev: () => {
      if (busy) return;
      setChapterIdx((i) => Math.max(0, i - 1));
    },
    submit,
  };

  const state: DraftState = {
    headline,
    problem,
    solution,
    outcomes,
    credentials,
    costs,
    milestones,
    coAuthors,
    votingDurationHours,
    phase,
    error,
    chapterIdx,
    drawerOpen,
  };

  const meta: DraftMeta = {
    address,
    isConnected,
    busy,
    totalCost,
    filledCostsCount: filledCostLines.length,
    filledMilestonesCount: filledMilestones.length,
    headlineTrim,
    headlineOver,
    valid,
    allValid,
    votingDurationBlocks,
    votingDurationValid,
    isLast,
    currentChapter,
    canAdvance,
    canBack,
  };

  return <DraftContext value={{ state, actions, meta }}>{children}</DraftContext>;
}

/* ============================================================
 * Wizard — top-level layout. Reads chapterIdx from context to
 *   dispatch the active folio. Holds no state of its own.
 * ============================================================ */

function Wizard() {
  const { state, actions } = useDraft();

  return (
    <main
      style={{ ["--ink" as string]: INK }}
      className="relative mx-auto min-h-[100dvh] max-w-7xl px-4 pb-40 pt-8 sm:px-6 sm:pt-12 lg:pb-32"
    >
      <div className="mb-6 sm:mb-10">
        <Link
          to="/proposals"
          className="group inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground sm:text-[11px]"
        >
          <ArrowLeft aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          The Register
        </Link>
      </div>

      <ProgressRail />

      <section className="mt-10 grid gap-12 sm:mt-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
        <div className="min-w-0">
          {/* keyed div so each chapter retriggers the folio-in animation */}
          <div key={state.chapterIdx} className="[animation:folio-in_440ms_cubic-bezier(.2,.7,.2,1)_both]">
            <ActiveFolio />
          </div>
        </div>

        <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <div className="border-l border-border pl-10">
            <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Cover sheet
            </div>
            <CoverDossier />
          </div>
        </aside>
      </section>

      <ActionBar />

      <Sheet open={state.drawerOpen} onOpenChange={actions.setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetTitle className="sr-only">Cover sheet & chapters</SheetTitle>
          <div className="px-5 pb-12 pt-4">
            <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Cover sheet
            </div>
            <CoverDossier />
            <div className="mt-8">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Chapters
              </div>
              <ChapterIndex
                onJump={(i) => {
                  actions.gotoChapter(i);
                  actions.setDrawerOpen(false);
                }}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}

function ActiveFolio() {
  const { meta } = useDraft();
  switch (meta.currentChapter.id) {
    case "motion":
      return <MotionFolio />;
    case "case":
      return <CaseFolio />;
    case "ledger":
      return <LedgerFolio />;
    case "voices":
      return <VoicesFolio />;
    case "seal":
      return <SealFolio />;
  }
}

/* ============================================================
 * ProgressRail — five clickable segments across the top.
 * ============================================================ */

function ProgressRail() {
  const {
    state: { chapterIdx },
    meta: { valid },
    actions,
  } = useDraft();
  return (
    <ol className="grid grid-cols-5 gap-1.5 sm:gap-3">
      {CHAPTERS.map((c, i) => {
        const isActive = i === chapterIdx;
        const isDone = i < chapterIdx && valid[c.id];
        return (
          <li key={c.id} className="relative">
            <button
              type="button"
              onClick={() => actions.gotoChapter(i)}
              aria-label={`Jump to chapter ${c.num} · ${c.name}`}
              aria-current={isActive ? "step" : undefined}
              className="group block w-full cursor-pointer text-left"
            >
              <div className="relative h-[3px] w-full overflow-hidden bg-border transition-colors group-hover:bg-foreground/30">
                <span
                  className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-out ${
                    isDone ? "w-full bg-foreground" : isActive ? "w-full" : "w-0"
                  }`}
                  style={isActive ? { background: "var(--ink)" } : undefined}
                />
                {isActive ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 [animation:ballot-sweep_2.4s_cubic-bezier(.55,0,.45,1)_infinite]"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent 0%, transparent 38%, color-mix(in oklch, white 70%, transparent) 50%, transparent 62%, transparent 100%)",
                    }}
                  />
                ) : null}
              </div>
              <div className="mt-2 flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.18em]">
                <span className="tabular-nums" style={isActive ? { color: "var(--ink)" } : undefined}>
                  <span className={isActive ? "" : isDone ? "text-foreground/70" : "text-muted-foreground/50"}>
                    {c.num}
                  </span>
                </span>
                <span
                  className={`hidden truncate sm:inline ${
                    isActive ? "text-foreground" : isDone ? "text-foreground/70" : "text-muted-foreground/45"
                  }`}
                >
                  {c.name}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ============================================================
 * Shared primitives — FolioShell, Inscription, SectionHead.
 *   Pure presentational. Take props, render UI.
 * ============================================================ */

function FolioShell({
  num,
  name,
  tagline,
  children,
}: {
  num: string;
  name: string;
  tagline: string;
  children: ReactNode;
}) {
  return (
    <article className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-10">
      <header className="lg:pt-2">
        <div
          aria-hidden
          className="font-display select-none text-[clamp(5.5rem,18vw,9.5rem)] font-[700] leading-[0.82] tracking-[-0.04em]"
          style={{
            color: "var(--ink)",
            fontVariationSettings: "'opsz' 144, 'SOFT' 0",
          }}
        >
          {num}
        </div>
        <div className="mt-3 lg:mt-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Chapter {num}</div>
          <h1
            className="font-display mt-1 text-3xl font-[500] tracking-tight text-foreground sm:text-4xl lg:text-[2.5rem]"
            style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0" }}
          >
            {name}
          </h1>
          <p className="mt-2 font-serif text-[14px] italic leading-relaxed text-muted-foreground sm:text-[15px]">
            {tagline}
          </p>
        </div>
      </header>
      <div className="min-w-0">{children}</div>
    </article>
  );
}

function Inscription({
  value,
  onChange,
  disabled,
  placeholder,
  valid,
  rows = 4,
  minHeight = "6.5rem",
  className = "",
  style,
  decoration,
  ariaLabel,
}: {
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
  placeholder: string;
  valid: boolean;
  rows?: number;
  minHeight?: string;
  className?: string;
  style?: React.CSSProperties;
  decoration?: ReactNode;
  ariaLabel?: string;
}) {
  const idle = "color-mix(in oklch, currentColor 16%, transparent)";
  return (
    <div className="relative">
      {decoration}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        aria-label={ariaLabel}
        className={`block w-full resize-none bg-secondary/40 text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 disabled:opacity-60 [field-sizing:content] ${className}`}
        style={{
          minHeight,
          border: "1px solid",
          borderColor: valid ? "var(--ink)" : idle,
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--ink)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = valid ? "var(--ink)" : idle;
        }}
      />
    </div>
  );
}

function SectionHead({ tag, title, hint, ok }: { tag: string; title: string; hint?: string; ok: boolean }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="flex items-end gap-3 sm:gap-4">
        <span
          className="inline-flex h-7 min-w-[2.25rem] items-center justify-center px-2 font-mono text-[11px] uppercase tracking-[0.2em] tabular-nums sm:h-8 sm:min-w-[2.5rem]"
          style={{
            border: ok ? "1.5px solid var(--ink)" : "1.5px solid color-mix(in oklch, currentColor 18%, transparent)",
            color: ok ? "var(--ink)" : undefined,
            background: ok ? "color-mix(in oklch, var(--ink) 10%, transparent)" : undefined,
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

/* ============================================================
 * 01 — Motion
 * ============================================================ */

function MotionFolio() {
  const {
    state: { headline },
    actions: { setHeadline },
    meta: { busy, headlineTrim, headlineOver },
  } = useDraft();

  return (
    <FolioShell
      num="01"
      name="The motion"
      tagline="A single decisive headline. The rest of the brief is built from it."
    >
      <SectionHead tag="I" title="Headline" hint="Begin with a verb." ok={!!headlineTrim} />
      <div className="mt-5">
        <Inscription
          value={headline}
          onChange={setHeadline}
          disabled={busy}
          placeholder="Resolved, that the assembly shall…"
          valid={!!headlineTrim}
          rows={3}
          ariaLabel="Motion headline"
          className="p-4 font-serif text-[16px] leading-relaxed sm:text-[17px]"
        />
      </div>
      <div className="mt-3 flex items-center justify-end font-mono text-[10px] uppercase tracking-[0.18em]">
        <span
          className={headlineOver ? "" : "text-muted-foreground"}
          style={headlineOver ? { color: "var(--ink)" } : undefined}
        >
          {headline.length} / {HEADLINE_MAX}
        </span>
      </div>
    </FolioShell>
  );
}

/* ============================================================
 * 02 — Case (problem + solution + outcomes)
 * ============================================================ */

function CaseFolio() {
  const {
    state: { problem, solution, outcomes },
    actions: { setProblem, setSolution, setOutcomes },
    meta: { busy },
  } = useDraft();

  return (
    <FolioShell
      num="02"
      name="The case"
      tagline="What is wrong, what should be done, how the assembly will know it worked."
    >
      <div className="space-y-14">
        <Prose
          tag="I"
          title="Problem"
          hint="Quantify where possible."
          value={problem}
          onChange={setProblem}
          placeholder="Describe the situation the assembly must correct."
          disabled={busy}
        />
        <Prose
          tag="II"
          title="Solution"
          hint="What will be done, by whom, accountable how."
          value={solution}
          onChange={setSolution}
          placeholder="Describe the action the assembly is asked to authorise."
          disabled={busy}
        />
        <Prose
          tag="III"
          title="Outcomes"
          hint="Name the measurable changes."
          value={outcomes}
          onChange={setOutcomes}
          placeholder="Who benefits, by how much, by when."
          disabled={busy}
        />
      </div>
    </FolioShell>
  );
}

function Prose({
  tag,
  title,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  tag: string;
  title: string;
  hint: string;
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  const len = value.trim().length;
  const ok = len >= 40;
  return (
    <section>
      <SectionHead tag={tag} title={title} hint={hint} ok={ok} />
      <div className="mt-5">
        <Inscription
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          valid={ok}
          className="p-4 font-serif text-[16px] leading-relaxed sm:text-[17px]"
        />
      </div>
      <div className="mt-2 flex items-center justify-end font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className={ok ? "" : "text-muted-foreground"} style={ok ? { color: "var(--ink)" } : undefined}>
          {ok ? "✓ sufficient" : `${Math.max(0, 40 - len)} chars to threshold`}
        </span>
      </div>
    </section>
  );
}

/* ============================================================
 * 03 — Ledger
 * ============================================================ */

function LedgerFolio() {
  const {
    state: { costs, milestones },
    actions,
    meta: { busy, totalCost, filledCostsCount, filledMilestonesCount },
  } = useDraft();

  return (
    <FolioShell num="03" name="The ledger" tagline="Every line of money accounted for, every milestone scheduled.">
      <section>
        <SectionHead
          tag="I"
          title="Cost breakdown"
          hint="USDC, every line accounted for."
          ok={filledCostsCount > 0 && totalCost > 0}
        />
        <div className="mt-4 space-y-2">
          {costs.map((line, i) => (
            <CostRow key={line.id} line={line} index={i} removable={costs.length > 1} />
          ))}
          <div className="flex items-end justify-between gap-4 py-3">
            <button
              type="button"
              onClick={actions.addCost}
              disabled={busy}
              className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
            >
              + Add line
            </button>
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
      </section>

      <section className="mt-12">
        <SectionHead tag="II" title="Funding milestones" hint="Release schedule." ok={filledMilestonesCount > 0} />
        <ol className="mt-4 space-y-2">
          {milestones.map((m, i) => (
            <MilestoneRow key={m.id} milestone={m} index={i} removable={milestones.length > 1} />
          ))}
        </ol>
        <button
          type="button"
          onClick={actions.addMilestone}
          disabled={busy}
          className="mt-3 cursor-pointer font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
        >
          + Add milestone
        </button>
      </section>
    </FolioShell>
  );
}

function CostRow({ line, index, removable }: { line: CostLine; index: number; removable: boolean }) {
  const {
    actions: { updateCost, removeCost },
    meta: { busy },
  } = useDraft();
  return (
    <div
      className="flex flex-col gap-2 bg-secondary/40 px-3 py-2.5 transition-colors focus-within:[border-color:var(--ink)] sm:flex-row sm:items-center sm:gap-3 sm:py-2"
      style={{
        border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
      }}
    >
      <input
        value={line.item}
        onChange={(e) => updateCost(line.id, { item: e.target.value })}
        placeholder={index === 0 ? "e.g. Honorarium — workshop facilitator" : "Line item"}
        disabled={busy}
        className="min-w-0 flex-1 border-0 bg-transparent py-1 font-serif text-[15px] text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-[16px]"
        aria-label={`Cost item ${index + 1}`}
      />
      <div className="flex items-center justify-end gap-3 sm:shrink-0">
        <input
          value={line.amount}
          onChange={(e) => updateCost(line.id, { amount: sanitiseAmount(e.target.value) })}
          inputMode="decimal"
          placeholder="0.00"
          disabled={busy}
          className="w-24 bg-transparent py-1 pr-1 text-right font-mono text-[14px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
          aria-label={`Amount for line ${index + 1}`}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">USDC</span>
        <button
          type="button"
          onClick={() => removeCost(line.id)}
          disabled={!removable || busy}
          aria-label="Remove line"
          className="cursor-pointer font-mono text-base text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function MilestoneRow({ milestone, index, removable }: { milestone: Milestone; index: number; removable: boolean }) {
  const {
    actions: { updateMilestone, removeMilestone },
    meta: { busy },
  } = useDraft();
  return (
    <li
      className="space-y-2 bg-secondary/40 px-3 py-3 transition-colors focus-within:[border-color:var(--ink)]"
      style={{
        border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <input
          value={milestone.label}
          onChange={(e) => updateMilestone(milestone.id, { label: e.target.value })}
          placeholder={`M${index + 1}`}
          disabled={busy}
          className="w-20 border-0 bg-transparent py-1 font-mono text-[12px] uppercase tracking-[0.2em] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
          aria-label={`Milestone ${index + 1} label`}
        />
        <button
          type="button"
          onClick={() => removeMilestone(milestone.id)}
          disabled={!removable || busy}
          aria-label="Remove milestone"
          className="cursor-pointer font-mono text-base text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          ×
        </button>
      </div>
      <input
        value={milestone.detail}
        onChange={(e) => updateMilestone(milestone.id, { detail: e.target.value })}
        placeholder="What is delivered at this milestone"
        disabled={busy}
        className="w-full border-0 bg-transparent py-1 font-serif text-[15px] text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-[16px]"
        aria-label={`Milestone ${index + 1} deliverable`}
      />
      <div className="flex items-center justify-between gap-3">
        <input
          type="date"
          value={milestone.date}
          onChange={(e) => updateMilestone(milestone.id, { date: e.target.value })}
          disabled={busy}
          className="border-0 bg-transparent px-0 py-0 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground outline-none [color-scheme:light_dark] focus:text-foreground"
          aria-label={`Milestone ${index + 1} date`}
        />
        <div className="flex items-center gap-2">
          <input
            value={milestone.amount}
            onChange={(e) =>
              updateMilestone(milestone.id, {
                amount: sanitiseAmount(e.target.value),
              })
            }
            inputMode="decimal"
            placeholder="amount"
            disabled={busy}
            className="w-24 bg-transparent py-1 pr-1 text-right font-mono text-[13px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
            aria-label={`Milestone ${index + 1} amount`}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">USDC</span>
        </div>
      </div>
    </li>
  );
}

/* ============================================================
 * 04 — Voices
 * ============================================================ */

function VoicesFolio() {
  const {
    state: { coAuthors, credentials },
    actions: { setCredentials, removeCoAuthor },
    meta: { address, isConnected, busy },
  } = useDraft();

  return (
    <FolioShell
      num="04"
      name="The voices"
      tagline="Who stands behind the motion. Lead, co-authors, and any prior record worth citing."
    >
      <section>
        <SectionHead
          tag="I"
          title="Lead author"
          hint="The wallet that moves the motion."
          ok={!!address && isConnected}
        />
        {address && isConnected ? (
          <ul className="mt-4">
            <AuthorRow address={address} role="lead" />
          </ul>
        ) : (
          <p
            className="mt-4 bg-secondary/40 px-3 py-3 font-serif text-[14px] italic text-muted-foreground"
            style={{
              border: "1px dashed color-mix(in oklch, currentColor 22%, transparent)",
            }}
          >
            Connect a wallet to take lead authorship.
          </p>
        )}
      </section>

      <section className="mt-10">
        <SectionHead
          tag="II"
          title="Co-authors"
          hint={`${coAuthors.length} added · optional`}
          ok={coAuthors.length > 0}
        />
        {coAuthors.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {coAuthors.map((a) => (
              <AuthorRow key={a} address={a} role="co-author" onRemove={() => removeCoAuthor(a)} />
            ))}
          </ul>
        ) : null}
        <div className="mt-4">
          <CommunityPicker />
        </div>
      </section>

      <section className="mt-10">
        <SectionHead
          tag="III"
          title="Credentials"
          hint="Prior work, references — optional."
          ok={credentials.trim().length > 0}
        />
        <div className="mt-3">
          <Inscription
            value={credentials}
            onChange={setCredentials}
            disabled={busy}
            placeholder="Relevant prior work, references, roles. Plain text; no gloss needed."
            valid={credentials.trim().length > 0}
            className="p-4 font-serif text-[15px] leading-relaxed sm:text-[16px]"
          />
        </div>
      </section>
    </FolioShell>
  );
}

function AuthorRow({
  address,
  role,
  onRemove,
}: {
  address: Address;
  role: "lead" | "co-author";
  onRemove?: () => void;
}) {
  const { data: name } = useIdentity(address);
  return (
    <li
      className="flex items-center justify-between gap-3 bg-secondary/40 px-3 py-2.5 sm:gap-4 sm:py-3"
      style={{
        border: "1px solid color-mix(in oklch, currentColor 16%, transparent)",
      }}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 sm:flex-nowrap">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {role === "lead" ? "Lead" : "Co"}
        </span>
        <span className="truncate font-serif text-[15px] text-foreground sm:text-[16px]">
          {name ?? truncateAddress(address)}
        </span>
        {name ? (
          <span className="truncate font-mono text-[11px] text-muted-foreground">{truncateAddress(address)}</span>
        ) : null}
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 cursor-pointer font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
        >
          Remove
        </button>
      ) : null}
    </li>
  );
}

function CommunityPicker() {
  const {
    state: { coAuthors },
    actions: { addCoAuthor },
    meta: { address: selfAddress },
  } = useDraft();
  const { data: members, isLoading } = useAllMembers();
  const { data: claimed } = useClaimedSubnames();
  const { data: ipecity } = useIpecitySubnames();
  const [query, setQuery] = useState("");

  const selfLower = selfAddress?.toLowerCase();
  const selectedSet = useMemo(() => new Set(coAuthors.map((a) => a.toLowerCase())), [coAuthors]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (members ?? [])
      .map((m) => m.owner as Address)
      .filter((a) => a.toLowerCase() !== selfLower && !selectedSet.has(a.toLowerCase()));

    // Each row carries every display name we can resolve cheaply (govdemo L2
    // claim + legacy ipecity wrapped subname) so the search box matches both.
    // ENS primary names still need one RPC per address — those are resolved
    // lazily inside PickerRow and aren't searchable until the rows mount.
    const rows = all.map((a) => {
      const lower = a.toLowerCase();
      const claim = claimed?.get(lower);
      const ipe = ipecity?.get(lower);
      return {
        address: a,
        name: claim ?? ipe ?? undefined,
        haystack: [a, claim, ipe].filter(Boolean).join(" ").toLowerCase(),
      };
    });

    const matched = !q ? rows : rows.filter((r) => r.haystack.includes(q));

    matched.sort((a, b) => {
      if (!!a.name === !!b.name) {
        return (a.name ?? a.address).localeCompare(b.name ?? b.address);
      }
      return a.name ? -1 : 1;
    });

    return matched.map((r) => r.address);
  }, [members, claimed, ipecity, query, selfLower, selectedSet]);

  const idle = "color-mix(in oklch, currentColor 16%, transparent)";
  return (
    <div
      className="bg-secondary/40 transition-colors focus-within:[border-color:var(--ink)]"
      style={{ border: `1px solid ${idle}` }}
    >
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
        style={{ borderBottom: `1px solid ${idle}` }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Search</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="address or .ipecity.eth"
          className="min-w-0 flex-1 border-0 bg-transparent py-1 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/40"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] tabular-nums text-muted-foreground">
          {isLoading ? "…" : `${members?.length ?? 0} members`}
        </span>
      </div>
      {candidates.length === 0 ? (
        <div className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {isLoading ? "Loading members…" : "No matching members"}
        </div>
      ) : (
        <ul className="max-h-64 overflow-auto">
          {candidates.map((a, i) => (
            <li key={a} style={i > 0 ? { borderTop: `1px solid ${idle}` } : undefined}>
              <PickerRow address={a} onAdd={() => addCoAuthor(a)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PickerRow({ address, onAdd }: { address: Address; onAdd: () => void }) {
  const { data: name } = useIdentity(address);
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`Add ${name ?? truncateAddress(address)} as co-author`}
      className="group flex w-full cursor-pointer items-center justify-between gap-4 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
    >
      <div className="min-w-0">
        <div className="truncate font-serif text-[15px] text-foreground">{name ?? truncateAddress(address)}</div>
        {name ? (
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {truncateAddress(address)}
          </div>
        ) : null}
      </div>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground transition-colors group-hover:text-[color:var(--ink)]">
        + Add
      </span>
    </button>
  );
}

/* ============================================================
 * 05 — Seal
 * ============================================================ */

function SealFolio() {
  const {
    state: { phase, error },
    meta: { allValid, isConnected, votingDurationValid },
  } = useDraft();

  const status = error
    ? `Error · ${error}`
    : phase === "done"
      ? "Motion accepted — returning to the register"
      : phase === "submitting"
        ? "Recording on-chain"
        : phase === "pinning"
          ? "Pinning to IPFS"
          : phase === "signing"
            ? "Awaiting signature"
            : !isConnected
              ? "Sign in to file a motion"
              : allValid
                ? "Ready to file"
                : "Complete preceding chapters before filing";

  return (
    <FolioShell num="05" name="The seal" tagline="A last look at the cover, then the motion is filed.">
      <div className="lg:hidden">
        <CoverDossier />
      </div>
      <div className="hidden lg:block">
        <p className="border border-dashed border-border bg-secondary/30 p-5 font-serif text-[14px] italic leading-relaxed text-muted-foreground">
          The cover sheet sits to the right. When you tap{" "}
          <span className="not-italic font-mono text-[12px] uppercase tracking-[0.18em] text-foreground">
            File motion
          </span>
          , three things happen: you sign your intent, the brief pins to IPFS, and the content identifier is recorded
          on-chain. Submission is sponsored — you pay nothing.
        </p>
      </div>

      <section className="mt-10">
        <SectionHead
          tag="I"
          title="Voting window"
          hint="How long does the assembly have to vote?"
          ok={votingDurationValid}
        />
        <VotingDurationPicker />
      </section>

      <section className="mt-10">
        <SectionHead tag="II" title="Passage" hint="Three movements." ok={phase === "done"} />
        <ol className="mt-4 divide-y divide-border border-y border-border">
          {PASSAGE.map((step, i) => {
            const state = stepState(phase, step.key);
            return (
              <li
                key={step.key}
                className="relative grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 py-3.5 sm:grid-cols-[3.25rem_1fr_auto] sm:gap-4"
              >
                {state === "active" ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-[3px] [animation:ballot-sweep_1.8s_cubic-bezier(.55,0,.45,1)_infinite]"
                    style={{ background: "var(--ink)" }}
                  />
                ) : null}
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.22em] tabular-nums ${
                    state === "active" ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  §&nbsp;{String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`text-[15px] sm:text-base ${
                    state === "done"
                      ? "text-muted-foreground line-through decoration-foreground/30"
                      : state === "active"
                        ? "text-foreground [animation:ballot-pulse_1.6s_ease-in-out_infinite]"
                        : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {state === "active"
                    ? "in progress"
                    : state === "done"
                      ? "done"
                      : state === "pending"
                        ? "waiting"
                        : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <p
        role={error ? "alert" : undefined}
        className={`mt-8 font-mono text-[11px] uppercase tracking-[0.18em] ${
          error ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {status}
      </p>

      <p className="mt-6 font-serif text-[13px] leading-relaxed text-muted-foreground">
        On the record, the full brief is pinned to IPFS; only its content identifier is stored on-chain. On gas,
        submission is sponsored — members vote in confidence.
      </p>
      {!votingDurationValid ? (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
          Voting window is outside the allowed range — adjust above before filing.
        </p>
      ) : null}
    </FolioShell>
  );
}

function VotingDurationPicker() {
  const {
    state: { votingDurationHours },
    actions: { setVotingDurationHours },
    meta: { votingDurationBlocks, votingDurationValid },
  } = useDraft();

  const matchedPreset = VOTING_PRESETS.find((p) => Math.abs(p.hours - votingDurationHours) < 1e-6);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        {VOTING_PRESETS.map((preset) => {
          const active = matchedPreset?.label === preset.label;
          return (
            <button
              type="button"
              key={preset.label}
              onClick={() => setVotingDurationHours(preset.hours)}
              className={`group inline-flex items-baseline gap-2 border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={active}
            >
              <span>{preset.label}</span>
              {preset.note ? (
                <span
                  className={`text-[9px] tracking-[0.16em] ${active ? "text-background/70" : "text-muted-foreground/70"}`}
                >
                  {preset.note}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Custom (hours) · {MIN_VOTING_DURATION_HOURS.toFixed(2)}–{Math.round(MAX_VOTING_DURATION_HOURS)}
        </span>
        <input
          type="number"
          min={MIN_VOTING_DURATION_HOURS}
          max={MAX_VOTING_DURATION_HOURS}
          step="0.1"
          value={Number.isFinite(votingDurationHours) ? votingDurationHours : ""}
          onChange={(e) => {
            const next = Number(e.target.value);
            setVotingDurationHours(Number.isFinite(next) ? next : 0);
          }}
          className="mt-1 w-32 border border-border bg-transparent px-2 py-1.5 font-mono text-[13px] tabular-nums text-foreground focus:border-foreground focus:outline-none"
        />
      </label>

      <p className="font-serif text-[13px] leading-relaxed text-muted-foreground">
        {votingDurationValid
          ? `Voting closes ~${formatVotingHours(votingDurationHours)} after submission (${votingDurationBlocks.toLocaleString()} blocks at ${SEPOLIA_BLOCK_TIME_SECONDS}s each).`
          : `Voting window must be between ${MIN_VOTING_DURATION_HOURS.toFixed(2)} and ${Math.round(MAX_VOTING_DURATION_HOURS)} hours.`}
      </p>
    </div>
  );
}

function formatVotingHours(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} min`;
  }
  if (hours < 24) {
    return `${Math.round(hours)} h`;
  }
  const days = hours / 24;
  return `${days % 1 === 0 ? days.toFixed(0) : days.toFixed(1)} days`;
}

/* ============================================================
 * Cover dossier — used in the right rail and the mobile drawer.
 *   Reads from context, no props.
 * ============================================================ */

function CoverDossier() {
  const {
    state: { phase, coAuthors, votingDurationHours },
    meta: { headlineTrim, totalCost, filledMilestonesCount, address, votingDurationValid },
  } = useDraft();
  const filed = phase === "done";

  return (
    <div
      className="relative overflow-hidden border border-border bg-secondary/30 px-5 py-5"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, color-mix(in oklch, currentColor 8%, transparent) 1px, transparent 1.5px)",
        backgroundSize: "14px 14px",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-2"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, var(--ink) 0 6px, transparent 6px 12px)",
          opacity: 0.5,
        }}
      />

      {!filed ? (
        <div
          aria-hidden
          className="font-display pointer-events-none absolute -bottom-3 -right-2 select-none text-[5.5rem] font-[700] leading-none text-foreground/[0.05] sm:text-[6.5rem]"
        >
          DRAFT
        </div>
      ) : null}

      {filed ? (
        <div
          aria-hidden
          className="font-display pointer-events-none absolute right-4 top-8 select-none text-3xl font-[900] uppercase tracking-[0.05em] sm:text-4xl"
          style={{
            color: "var(--ink)",
            border: "3px solid var(--ink)",
            padding: "4px 10px",
            animation: "seal-stamp 700ms cubic-bezier(.2,.8,.2,1) both",
          }}
        >
          Filed
        </div>
      ) : null}

      <div className="relative flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>Motion · {filed ? "filed" : "draft"}</span>
        <span className="tabular-nums">№ pending</span>
      </div>
      <p
        className={`relative mt-4 font-serif text-[17px] leading-snug ${
          headlineTrim ? "text-foreground" : "italic text-muted-foreground/60"
        }`}
      >
        {headlineTrim || "Resolved, that the assembly shall…"}
      </p>
      <div className="relative mt-5 border-t border-border pt-4">
        <DossierRow label="Budget" value={totalCost > 0 ? `${formatAmount(totalCost)} USDC` : "—"} />
        <DossierRow label="Milestones" value={filledMilestonesCount ? String(filledMilestonesCount) : "—"} />
        <DossierRow label="Authors" value={String(1 + coAuthors.length)} />
        <DossierRow label="Voting" value={votingDurationValid ? formatVotingHours(votingDurationHours) : "—"} />
        <DossierRow label="Moved by" value={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"} />
      </div>
    </div>
  );
}

function DossierRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground/90">{value}</span>
    </div>
  );
}

/* ============================================================
 * Chapter index — shown only in the mobile drawer.
 * ============================================================ */

function ChapterIndex({ onJump }: { onJump: (idx: number) => void }) {
  const {
    state: { chapterIdx },
    meta: { valid },
  } = useDraft();

  return (
    <ol className="border-t border-border">
      {CHAPTERS.map((c, i) => {
        const isActive = i === chapterIdx;
        const ok = valid[c.id];
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onJump(i)}
              className={`flex w-full cursor-pointer items-baseline justify-between gap-3 border-b border-border py-3 text-left font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-baseline gap-3">
                <span className="tabular-nums" style={isActive ? { color: "var(--ink)" } : undefined}>
                  {c.num}
                </span>
                <span>{c.name}</span>
              </span>
              <span
                className={ok ? "text-foreground" : "text-muted-foreground/50"}
                aria-label={ok ? "complete" : "pending"}
              >
                {ok ? "●" : "○"}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ============================================================
 * Action bar — fixed at the bottom across breakpoints.
 *   Lives outside the folio stage but inside the provider, so
 *   it freely reads state and dispatches actions.
 * ============================================================ */

function ActionBar() {
  const {
    state: { phase, error },
    actions,
    meta: { currentChapter, canAdvance, canBack, isLast, busy },
  } = useDraft();

  const filed = phase === "done";
  const nextLabel = isLast ? (filed ? "Filed" : busy ? "Filing…" : "File motion") : "Next";
  const microStatus = error ? `Error · ${error}` : busy ? PASSAGE.find((s) => s.key === phase)?.label : null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={actions.gotoPrev}
          disabled={!canBack}
          aria-label="Previous chapter"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border border-border text-foreground transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => actions.setDrawerOpen(true)}
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 border border-border bg-secondary/40 px-3 py-2 text-left transition-colors hover:bg-accent/40"
          aria-label="Open cover sheet & chapter index"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
              <span className="tabular-nums" style={{ color: "var(--ink)" }}>
                {currentChapter.num}
              </span>
              <span> / {String(CHAPTERS.length).padStart(2, "0")} · </span>
              <span className="text-foreground">{currentChapter.name}</span>
            </span>
            <span className="truncate font-serif text-[12px] italic leading-tight text-muted-foreground">
              {microStatus ?? currentChapter.tagline}
            </span>
          </span>
          <span aria-hidden className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            ⌃
          </span>
        </button>

        <Button
          type="button"
          onClick={actions.gotoNext}
          disabled={!canAdvance || filed}
          size="lg"
          className="h-11 shrink-0 cursor-pointer px-4 font-mono text-[11px] uppercase tracking-[0.2em] sm:px-6"
          style={isLast && canAdvance && !filed && !busy ? { background: "var(--ink)" } : undefined}
        >
          {nextLabel}
          {!isLast ? <ArrowRight aria-hidden className="ml-2 h-3.5 w-3.5" /> : null}
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
 * Helpers
 * ============================================================ */

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function sanitiseAmount(s: string) {
  const cleaned = s.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

function formatAmount(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function stepState(phase: Phase, step: Exclude<Phase, "idle" | "error">): "pending" | "active" | "done" | "idle" {
  if (phase === "idle" || phase === "error") return "idle";
  const order: Array<Exclude<Phase, "idle" | "error">> = ["signing", "pinning", "submitting", "done"];
  const cur = order.indexOf(phase);
  const me = order.indexOf(step);
  if (phase === "done") return me <= cur ? "done" : "idle";
  if (me < cur) return "done";
  if (me === cur) return "active";
  return "pending";
}

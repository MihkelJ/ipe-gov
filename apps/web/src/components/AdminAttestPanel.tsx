import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { getAddress, isAddress, isHex, keccak256, padHex, toBytes, zeroHash, type Hex } from "viem";

import { schemaUids, type IpeSchemaName } from "@ipe-gov/sdk";

import { useIssueAttestation } from "#/hooks/eas/useIssueAttestation";
import { useIsAttesterAdmin } from "#/hooks/eas/useIsAttesterAdmin";
import { truncateAddress } from "#/lib/address";
import { cn } from "#/lib/utils";

import { Button } from "./ui/button";

// ─── Tokens ──────────────────────────────────────────────────────────
// Match the dossier's editorial-ledger language: squared corners, mono
// caps with tracked spacing, hairline rules, no chromatic accents.

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground";
const EYEBROW_ON = "font-mono text-[10px] uppercase tracking-[0.22em] text-foreground";

const REGISTER: { name: IpeSchemaName; numeral: string; title: string; gloss: string }[] = [
  { name: "IpeResident", numeral: "I", title: "Resident", gloss: "first attendance" },
  { name: "IpeCheckin", numeral: "II", title: "Check-in", gloss: "per-event ledger" },
  { name: "IpeRole", numeral: "III", title: "Role", gloss: "council, steward …" },
  { name: "IpeProjectLaunched", numeral: "IV", title: "Project", gloss: "shipped at Village" },
  { name: "IpeSkill", numeral: "V", title: "Skill", gloss: "endorsed / verified" },
];

// ─── Trigger + Dialog ────────────────────────────────────────────────

export function AdminAttestPanel({ recipient }: { recipient: Hex }) {
  const isAdmin = useIsAttesterAdmin();
  const [open, setOpen] = useState(false);
  // Reset to first slip every time the dialog reopens — fresh session each
  // visit. Form state lives inside each slip; closing unmounts and discards
  // (intentional — stale half-typed slips are worse than retyping a few rows).
  const [active, setActive] = useState<IpeSchemaName>("IpeResident");

  if (!isAdmin) return null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setActive("IpeResident");
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button
          size="sm"
          className={cn(
            "rounded-none border border-foreground bg-foreground text-background shadow-none",
            "px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em]",
            "hover:bg-foreground/85",
          )}
        >
          [&nbsp;§&nbsp;Issue&nbsp;attestation&nbsp;]
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Don't autofocus the first input — the close button + slip
            // header read more clearly when the dialog opens. The user can
            // still tab into the form.
            e.preventDefault();
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[min(820px,calc(100vw-1.5rem))] max-h-[min(86vh,840px)]",
            "flex flex-col overflow-hidden rounded-none border border-foreground/40 bg-background shadow-2xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150",
          )}
        >
          <DialogMasthead recipient={recipient} />
          <DialogRegister active={active} onChange={setActive} />
          <DialogSlip recipient={recipient} active={active} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── Dialog chrome ───────────────────────────────────────────────────

function DialogMasthead({ recipient }: { recipient: Hex }) {
  return (
    <header className="flex shrink-0 items-baseline justify-between gap-x-6 gap-y-2 border-b border-foreground/40 px-5 py-4 sm:px-7">
      <div className="flex flex-col gap-0.5">
        <DialogPrimitive.Title asChild>
          <span className={EYEBROW_ON}>§ Registrar · Issue attestation</span>
        </DialogPrimitive.Title>
        <div className="flex items-baseline gap-2 sm:gap-3">
          <span className={EYEBROW}>To</span>
          <code className="font-mono text-[11px] tracking-[0.06em] text-foreground sm:text-xs">
            {truncateAddress(recipient)}
          </code>
          <span className={EYEBROW}>· Sepolia</span>
        </div>
      </div>
      <DialogPrimitive.Close asChild>
        <button
          type="button"
          className={cn(
            "shrink-0 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.2em]",
            "text-muted-foreground transition-colors hover:text-foreground",
          )}
        >
          [&nbsp;Close&nbsp;]
        </button>
      </DialogPrimitive.Close>
    </header>
  );
}

function DialogRegister({ active, onChange }: { active: IpeSchemaName; onChange: (n: IpeSchemaName) => void }) {
  return (
    <nav
      aria-label="Schema register"
      className={cn("shrink-0 grid grid-cols-5 overflow-x-auto border-b border-foreground/15 bg-background")}
    >
      {REGISTER.map((e, i) => {
        const on = e.name === active;
        return (
          <button
            key={e.name}
            type="button"
            onClick={() => onChange(e.name)}
            aria-current={on}
            className={cn(
              "group relative flex flex-col items-start gap-0.5 px-3 py-3 text-left transition-colors sm:gap-1 sm:px-5 sm:py-4",
              !on && "hover:bg-muted/40",
              "border-t-[3px]",
              on ? "border-foreground bg-muted/30" : "border-transparent",
              i > 0 && "border-l border-l-foreground/15",
            )}
          >
            <span className={cn(EYEBROW, on && "text-foreground")}>§&nbsp;{e.numeral}</span>
            <span
              className={cn(
                "font-mono text-[11px] uppercase tracking-[0.18em] sm:text-[12px] sm:tracking-[0.2em]",
                on ? "font-bold text-foreground" : "text-muted-foreground",
              )}
            >
              {e.title}
            </span>
            <span className="hidden font-serif text-[11px] italic leading-tight text-muted-foreground/80 sm:block">
              {e.gloss}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function DialogSlip({ recipient, active }: { recipient: Hex; active: IpeSchemaName }) {
  const entry = REGISTER.find((e) => e.name === active)!;
  return (
    <div
      // `key` forces a remount on schema switch so the staggered field
      // reveal plays each time the user changes slips — feels like turning
      // a page rather than swapping a panel in place.
      key={active}
      className={cn("flex flex-1 flex-col overflow-hidden", "animate-in fade-in slide-in-from-bottom-2 duration-300")}
    >
      {/* Slip header — sticky inside the body so the slip code stays
          visible while the form scrolls. */}
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-6 pb-3 sm:px-9 sm:pt-7">
        <div className="flex items-baseline gap-3">
          <span className={EYEBROW}>Slip</span>
          <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-foreground">
            {entry.numeral} — {entry.title.toUpperCase()}
          </span>
        </div>
        <code className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
          {truncateUid(schemaUids.sepolia[active])}
        </code>
      </div>
      {active === "IpeResident" && <ResidentForm recipient={recipient} numeral={entry.numeral} title={entry.title} />}
      {active === "IpeCheckin" && <CheckinForm recipient={recipient} numeral={entry.numeral} title={entry.title} />}
      {active === "IpeRole" && <RoleForm recipient={recipient} numeral={entry.numeral} title={entry.title} />}
      {active === "IpeProjectLaunched" && (
        <ProjectForm recipient={recipient} numeral={entry.numeral} title={entry.title} />
      )}
      {active === "IpeSkill" && <SkillForm recipient={recipient} numeral={entry.numeral} title={entry.title} />}
    </div>
  );
}

// ─── Per-schema slips ─────────────────────────────────────────────────

type FormProps = { recipient: Hex; numeral: string; title: string };

function ResidentForm({ recipient, numeral, title }: FormProps) {
  const issue = useIssueAttestation("IpeResident");
  const [eventSlug, setEventSlug] = useState("ipe-village-floripa-2026");
  const [metadataURI, setMetadataURI] = useState("");

  return (
    <Slip
      hint="Marks first in-person attendance. One per person — re-issuing creates a duplicate."
      isPending={issue.isPending}
      error={issue.error}
      submit={`Attest · § ${numeral} · ${title}`}
      onSubmit={() =>
        issue.mutateAsync({
          recipient,
          values: [keccak256(toBytes(eventSlug)), metadataURI],
        })
      }
    >
      <RuledField label="Event slug" hint="hashed via keccak256" index={0}>
        <RuledInput value={eventSlug} onChange={setEventSlug} required />
      </RuledField>
      <RuledField label="Metadata URI" hint="optional" index={1}>
        <RuledInput value={metadataURI} onChange={setMetadataURI} placeholder="ipfs://…" />
      </RuledField>
    </Slip>
  );
}

const CHECKIN_ROLES = [
  { value: 1, label: "Attendee", hint: "Attendee" },
  { value: 2, label: "Speaker", hint: "Speaker" },
  { value: 3, label: "Organizer", hint: "Organizer" },
  { value: 4, label: "Volunteer", hint: "Volunteer" },
  { value: 5, label: "Scholarship", hint: "Scholarship recipient" },
  { value: 6, label: "Sponsor", hint: "Sponsor" },
];

function CheckinForm({ recipient, numeral, title }: FormProps) {
  const issue = useIssueAttestation("IpeCheckin");
  const [eventSlug, setEventSlug] = useState("ipe-village-floripa-2026");
  const [role, setRole] = useState(1);
  const [inPerson, setInPerson] = useState(true);

  return (
    <Slip
      hint="Per-event participation record. externalRefHash defaults to zero — supply a salted hash if needed."
      isPending={issue.isPending}
      error={issue.error}
      submit={`Attest · § ${numeral} · ${title}`}
      onSubmit={() =>
        issue.mutateAsync({
          recipient,
          values: [keccak256(toBytes(eventSlug)), role, inPerson, zeroHash],
        })
      }
    >
      <RuledField label="Event slug" index={0}>
        <RuledInput value={eventSlug} onChange={setEventSlug} required />
      </RuledField>
      <RuledField label="Role" full index={1}>
        <ChipChoices value={role} onChange={setRole} options={CHECKIN_ROLES} />
      </RuledField>
      <RuledField label="Presence" full index={2}>
        <TogglePair
          value={inPerson}
          onChange={setInPerson}
          left={{ value: true, label: "In-person" }}
          right={{ value: false, label: "Online" }}
        />
      </RuledField>
    </Slip>
  );
}

function RoleForm({ recipient, numeral, title }: FormProps) {
  const issue = useIssueAttestation("IpeRole");
  const [roleSlug, setRoleSlug] = useState("steward");
  const [metadataURI, setMetadataURI] = useState("");

  return (
    <Slip
      hint="Roles are additive — issue one attestation per role. Revoke to remove."
      isPending={issue.isPending}
      error={issue.error}
      submit={`Attest · § ${numeral} · ${title}`}
      onSubmit={() =>
        issue.mutateAsync({
          recipient,
          values: [keccak256(toBytes(roleSlug)), metadataURI],
        })
      }
    >
      <RuledField label="Role slug" hint="architect, explorer, facilitator, steward, council" index={0}>
        <RuledInput value={roleSlug} onChange={setRoleSlug} required />
      </RuledField>
      <RuledField label="Metadata URI" hint="optional" index={1}>
        <RuledInput value={metadataURI} onChange={setMetadataURI} placeholder="ipfs://…" />
      </RuledField>
    </Slip>
  );
}

const PROJECT_STATUSES = [
  { value: 1, label: "Prototype", hint: "Prototype" },
  { value: 2, label: "Deployed", hint: "Deployed" },
  { value: 3, label: "Production", hint: "Production" },
  { value: 4, label: "Research", hint: "Research" },
];

function ProjectForm({ recipient, numeral, title }: FormProps) {
  const issue = useIssueAttestation("IpeProjectLaunched");
  const [eventSlug, setEventSlug] = useState("ipe-village-floripa-2026");
  const [projectSlug, setProjectSlug] = useState("");
  const [deliverableURI, setDeliverableURI] = useState("");
  const [contributorsRaw, setContributorsRaw] = useState("");
  const [completionStatus, setCompletionStatus] = useState(1);
  const [metadataURI, setMetadataURI] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  return (
    <Slip
      hint="Issued when a project ships at a Village. Recipient is the project lead; additional contributors go in the array."
      isPending={issue.isPending}
      error={issue.error}
      localError={parseError}
      submit={`Attest · § ${numeral} · ${title}`}
      onSubmit={async () => {
        setParseError(null);
        const contributors = parseAddressList(contributorsRaw);
        if (contributors === null) {
          setParseError("contributors must be comma-separated 0x addresses");
          return;
        }
        await issue.mutateAsync({
          recipient,
          values: [
            keccak256(toBytes(eventSlug)),
            keccak256(toBytes(projectSlug || `${eventSlug}:${recipient}`)),
            deliverableURI,
            contributors,
            completionStatus,
            metadataURI,
          ],
        });
      }}
    >
      <RuledField label="Event slug" index={0}>
        <RuledInput value={eventSlug} onChange={setEventSlug} required />
      </RuledField>
      <RuledField label="Project slug" hint="defaults to event:recipient if blank" index={1}>
        <RuledInput value={projectSlug} onChange={setProjectSlug} placeholder="my-project" />
      </RuledField>
      <RuledField label="Deliverable URI" full index={2}>
        <RuledInput value={deliverableURI} onChange={setDeliverableURI} placeholder="https://github.com/…" required />
      </RuledField>
      <RuledField label="Contributors" hint="comma-separated 0x addresses" full index={3}>
        <RuledInput value={contributorsRaw} onChange={setContributorsRaw} placeholder="0xabc…, 0xdef…" />
      </RuledField>
      <RuledField label="Completion status" full index={4}>
        <ChipChoices value={completionStatus} onChange={setCompletionStatus} options={PROJECT_STATUSES} />
      </RuledField>
      <RuledField label="Metadata URI" hint="project name + description live here" full index={5}>
        <RuledInput value={metadataURI} onChange={setMetadataURI} placeholder="ipfs://…" />
      </RuledField>
    </Slip>
  );
}

function SkillForm({ recipient, numeral, title }: FormProps) {
  const issue = useIssueAttestation("IpeSkill");
  const [skillSlug, setSkillSlug] = useState("solidity");
  const [tier, setTier] = useState(2);
  const [level, setLevel] = useState(2);
  const [evidenceRefUID, setEvidenceRefUID] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  return (
    <Slip
      hint="Skill credential. Tier 1 (peer) is allowed from any wallet that holds an IpeResident — admin-only here covers tier 2."
      isPending={issue.isPending}
      error={issue.error}
      localError={parseError}
      submit={`Attest · § ${numeral} · ${title}`}
      onSubmit={async () => {
        setParseError(null);
        const ref = evidenceRefUID.trim();
        let refHex: Hex = zeroHash;
        if (ref) {
          if (!isHex(ref) || ref.length !== 66) {
            setParseError("evidenceRefUID must be a 0x-prefixed bytes32");
            return;
          }
          refHex = padHex(ref as Hex, { size: 32 });
        }
        await issue.mutateAsync({
          recipient,
          values: [keccak256(toBytes(skillSlug)), tier, level, refHex, metadataURI],
        });
      }}
    >
      <RuledField label="Skill slug" hint="from spec Appendix A taxonomy" index={0}>
        <RuledInput value={skillSlug} onChange={setSkillSlug} required />
      </RuledField>
      <RuledField label="Tier" full index={1}>
        <ChipChoices
          value={tier}
          onChange={setTier}
          options={[
            { value: 1, label: "Endorsed", hint: "Endorsed by peer" },
            { value: 2, label: "Verified", hint: "Verified by org / partner" },
          ]}
        />
      </RuledField>
      <RuledField label="Level" full index={2}>
        <ChipChoices
          value={level}
          onChange={setLevel}
          options={[
            { value: 0, label: "No opinion" },
            { value: 1, label: "Familiar" },
            { value: 2, label: "Working" },
            { value: 3, label: "Strong" },
            { value: 4, label: "Teaches" },
          ]}
        />
      </RuledField>
      <RuledField label="Evidence refUID" hint="optional 0x-prefixed bytes32" full index={3}>
        <RuledInput value={evidenceRefUID} onChange={setEvidenceRefUID} placeholder="0x…" />
      </RuledField>
      <RuledField label="Metadata URI" hint="optional" full index={4}>
        <RuledInput value={metadataURI} onChange={setMetadataURI} placeholder="ipfs://…" />
      </RuledField>
    </Slip>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────

function Slip({
  children,
  hint,
  submit,
  isPending,
  error,
  localError,
  onSubmit,
}: {
  children: ReactNode;
  hint: string;
  submit: string;
  isPending: boolean;
  error: unknown;
  localError?: string | null;
  onSubmit: () => Promise<unknown> | void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const handle = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit();
      setSubmitted(true);
    } catch {
      setSubmitted(false);
    }
  };
  const remoteError = error instanceof Error ? error.message : error ? String(error) : null;
  const visibleError = localError ?? remoteError;

  return (
    <form onSubmit={handle} className="flex min-h-0 flex-1 flex-col">
      {/* Scrollable middle — fields + hint live here. The masthead and
          counterfoil are pinned outside this scroll, so the action stays
          visible regardless of how tall the form gets. */}
      <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-5 pb-7 pt-2 sm:px-9 sm:pb-9">
        <p className="font-serif text-[14px] italic leading-relaxed text-muted-foreground">{hint}</p>
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">{children}</div>
        {visibleError ? (
          <p className="font-mono text-[11px] tracking-[0.06em] text-destructive">! {visibleError}</p>
        ) : null}
      </div>
      {/* Counterfoil — pinned. Paymaster postmark on the left, bracketed
          submit verb on the right. */}
      <div className="flex shrink-0 flex-col-reverse items-stretch gap-3 border-t border-foreground/40 bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-9">
        <span className={EYEBROW}>Paymaster · sepolia · sponsored</span>
        <Button
          type="submit"
          disabled={isPending}
          className={cn(
            "rounded-none border border-foreground bg-foreground text-background shadow-none",
            "px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em]",
            "transition-colors hover:bg-foreground/85 disabled:opacity-60",
          )}
        >
          [&nbsp;{isPending ? "Attesting…" : submitted ? "Attested · indexer pending" : submit}&nbsp;]
        </Button>
      </div>
    </form>
  );
}

function RuledField({
  label,
  hint,
  full,
  index = 0,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  index?: number;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-2",
        full && "sm:col-span-2",
        // Stagger reveal — feels like the form unfolds onto the desk one
        // row at a time. ~50ms steps are perceptible without dragging.
        "animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both",
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-baseline gap-2">
        <span className={EYEBROW}>{label}</span>
        {hint ? <span className="font-serif text-[11px] italic text-muted-foreground/80">({hint})</span> : null}
      </div>
      {children}
    </div>
  );
}

function RuledInput({
  value,
  onChange,
  required,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      className={cn(
        "w-full bg-transparent px-0 py-1.5 font-mono text-sm tracking-[0.02em] text-foreground",
        "border-0 border-b border-foreground/40",
        "placeholder:text-muted-foreground/50",
        "focus:border-foreground focus:outline-none focus:ring-0",
      )}
    />
  );
}

// Wrapping chip-style choice picker. Each chip sizes to its content; when
// the row fills, chips reflow to the next line. Replaces the fixed-width
// `Stamps` grid which crushes longer labels at 6+ options. Keeps the
// editorial language: squared borders, mono caps, inverted active state.
function ChipChoices<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            title={o.hint ?? o.label}
            aria-label={o.hint ?? o.label}
            aria-pressed={on}
            className={cn(
              "border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors",
              on
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/40 bg-background text-muted-foreground hover:border-foreground/60 hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function TogglePair<T>({
  value,
  onChange,
  left,
  right,
}: {
  value: T;
  onChange: (v: T) => void;
  left: { value: T; label: string };
  right: { value: T; label: string };
}) {
  const cell = (opt: { value: T; label: string }) => {
    const on = opt.value === value;
    return (
      <button
        key={String(opt.label)}
        type="button"
        onClick={() => onChange(opt.value)}
        aria-pressed={on}
        className={cn(
          "px-5 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors",
          on ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted",
        )}
      >
        {opt.label}
      </button>
    );
  };
  return (
    <div className="inline-grid grid-flow-col gap-px overflow-hidden border border-foreground/40 bg-foreground/40">
      {cell(left)}
      {cell(right)}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function truncateUid(uid: string): string {
  return `${uid.slice(0, 6)}…${uid.slice(-4)}`;
}

function parseAddressList(raw: string): Hex[] | null {
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const out: Hex[] = [];
  for (const p of parts) {
    if (!isAddress(p)) return null;
    out.push(getAddress(p));
  }
  return out;
}

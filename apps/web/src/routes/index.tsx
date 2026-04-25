import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Lock,
  Vote,
  ScrollText,
  KeyRound,
  Gavel,
  Share2,
  AtSign,
  Wallet,
  Database,
  Network,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Separator } from '#/components/ui/separator'

export const Route = createFileRoute('/')({ component: Home })

const EDITION_DATE = new Date().toLocaleDateString('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}).toUpperCase()

function Home() {
  return (
    <main className="relative">
      {/* Masthead strip — newspaper-style metadata bar */}
      <Masthead />

      {/* Hero — oversized editorial headline */}
      <section className="relative border-b border-border">
        {/* faint ledger-grid backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:grid-cols-12 lg:gap-10 lg:pb-24 lg:pt-20">
          <div className="lg:col-span-8">
            <div className="mb-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:text-[11px]">
              <span className="inline-block size-1.5 rounded-full bg-foreground/80 motion-safe:animate-pulse" />
              Volume 0 · Issue 01 · Field Bulletin
            </div>

            <h1 className="font-serif text-[2.6rem] leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-[5.25rem]">
              Confidential
              <br />
              governance
              <br />
              <span className="italic text-muted-foreground">for the</span>{' '}
              <span className="relative inline-block">
                pop-up city.
                <span
                  aria-hidden
                  className="absolute -bottom-1 left-0 right-0 h-[3px] bg-foreground/90 sm:h-1"
                />
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              Residents of <span className="text-foreground">Ipê</span> propose
              and decide together. Ballots are encrypted on-chain with{' '}
              <abbr
                title="Fully Homomorphic Encryption"
                className="cursor-help font-medium text-foreground decoration-foreground/30 underline-offset-4 [text-decoration-style:dotted]"
              >
                FHE
              </abbr>{' '}
              — only the aggregate tally is ever revealed.
            </p>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link to="/proposals">
                  Read the proposals
                  <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="h-12 px-3 text-base text-muted-foreground hover:text-foreground"
              >
                <a
                  href="https://docs.ipe.city/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the docs ↗
                </a>
              </Button>
            </div>
          </div>

          {/* Side ledger — quick orientation card, doubles as visual anchor */}
          <aside className="lg:col-span-4">
            <div className="relative h-full rounded-md border border-border bg-card/60 p-5 backdrop-blur-sm sm:p-6">
              <div className="mb-4 flex items-baseline justify-between border-b border-dashed border-border pb-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  The Ledger
                </span>
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  N°·001
                </span>
              </div>
              <dl className="space-y-3.5 text-sm">
                <LedgerRow
                  k="Charter"
                  v="Parallel Institutions"
                />
                <LedgerRow
                  k="Quorum"
                  v={
                    <span>
                      Architects only{' '}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        (Unlock key)
                      </span>
                    </span>
                  }
                />
                <LedgerRow k="Ballot" v="FHE-encrypted, on-chain" />
                <LedgerRow k="Privacy" v="Aggregate-only disclosure" />
                <LedgerRow
                  k="Status"
                  v={
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Live · accepting motions
                    </span>
                  }
                />
              </dl>
              <Separator className="my-5" />
              <p className="font-serif text-sm italic leading-snug text-muted-foreground">
                “A village runs on what its members can keep to themselves —
                and what they choose to count together.”
              </p>
              <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                — Charter, §1
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Three pillars — the civic loop */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeading
            kicker="The civic loop"
            title="Three movements, one quiet count."
          />
          <div className="mt-10 grid gap-px bg-border sm:grid-cols-3">
            <Pillar
              n="§01"
              icon={<ScrollText className="size-4" />}
              title="Propose"
              body="Any Architect drafts a motion. Plain text, public reasoning, plain consequences."
            />
            <Pillar
              n="§02"
              icon={<Lock className="size-4" />}
              title="Encrypt"
              body="Each ballot is sealed under FHE before it ever touches the chain. No one — not even the contract — sees how you voted."
            />
            <Pillar
              n="§03"
              icon={<Vote className="size-4" />}
              title="Decide"
              body="The contract sums the ciphertexts and reveals only the total. The vote happened; your choice did not leak."
            />
          </div>
        </div>
      </section>

      {/* FHE ballot diagram */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeading
            kicker="How a ballot moves"
            title="From your hand to the public count — without the middle being seen."
          />

          <ol className="mt-10 grid gap-3 sm:gap-4 md:grid-cols-4">
            <DiagramStep
              n="01"
              label="You choose"
              detail="Yes / No / Abstain, locally."
              kind="plain"
              token="YES"
            />
            <DiagramStep
              n="02"
              label="We seal"
              detail="Encrypted in your browser."
              kind="cipher"
              token="0x9f·c4·a1·…"
            />
            <DiagramStep
              n="03"
              label="Chain sums"
              detail="Ciphertexts add without opening."
              kind="cipher"
              token="Σ encrypted"
            />
            <DiagramStep
              n="04"
              label="Total revealed"
              detail="Only the aggregate is ever decrypted."
              kind="plain"
              token="142 — 38 — 12"
            />
          </ol>

          <p className="mt-8 max-w-2xl font-serif text-base italic leading-relaxed text-muted-foreground sm:text-lg">
            Your specific vote is{' '}
            <span className="not-italic font-mono text-xs uppercase tracking-[0.18em] text-foreground">
              never
            </span>{' '}
            decrypted on its own. Steps 02 and 03 are mathematically opaque, by
            construction.
          </p>
        </div>
      </section>

      {/* Protocol stack — specimen sheet */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeading
            kicker="Specimen sheet · what holds it up"
            title="Nine protocols, working in concert."
          />
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            None of this is bespoke cryptography. Ipê stitches together
            audited, public-good primitives — each one chosen for what it
            refuses to leak, who it lets in, and how cheaply it lets people
            participate.
          </p>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-2">
            <Spec
              n="01"
              icon={<ShieldCheck className="size-4" />}
              name="Zama fhEVM"
              tag="Confidentiality · FHE"
              body="Fully Homomorphic Encryption on EVM. Ballots are encrypted client-side and tallied as ciphertext — only the aggregate is decrypted, via a permissioned relayer."
              foot="zama.ai · @zama-fhe/relayer-sdk"
            />
            <Spec
              n="02"
              icon={<KeyRound className="size-4" />}
              name="Unlock Protocol"
              tag="Membership · ERC-721 keys"
              body="The village charter is a PublicLock contract. Holding a non-transferable key makes you an Architect — eligible to propose and to cast an encrypted vote."
              foot="unlock-protocol.com · PublicLock"
            />
            <Spec
              n="03"
              icon={<Gavel className="size-4" />}
              name="OpenZeppelin Governor"
              tag="Process · on-chain motions"
              body="A custom Governor (UnlockConfidentialGovernorLiquid) handles proposal lifecycle, quorum, and execution against the FHE tallies — wired to the Unlock key as the vote source."
              foot="openzeppelin.com · Governor + Timelock"
            />
            <Spec
              n="04"
              icon={<Share2 className="size-4" />}
              name="Liquid Delegation"
              tag="Voice · transferable trust"
              body="Architects may delegate their weight to another member, then revoke at any time. Trust flows like water; the receipt is on-chain."
              foot="custom · LiquidDelegation.sol"
            />
            <Spec
              n="05"
              icon={<AtSign className="size-4" />}
              name="ENS + NameWrapper"
              tag="Identity · *.ipecity.eth"
              body="Members claim a wrapped subname under ipecity.eth. The chain shows an address; the village shows a name."
              foot="ens.domains · L1 mainnet"
            />
            <Spec
              n="06"
              icon={<Wallet className="size-4" />}
              name="ERC-4337"
              tag="Access · account abstraction"
              body="Smart-account wallets via permissionless.js. A paymaster sponsors the gas for membership-gated writes so first-time members can act without holding ETH."
              foot="permissionless.js · paymaster proxy"
            />
            <Spec
              n="07"
              icon={<KeyRound className="size-4" />}
              name="Privy"
              tag="Onboarding · auth"
              body="Email and social sign-in produce embedded wallets, then bridge to external wallets when wanted. The door is wide; the room is the same."
              foot="privy.io · @privy-io/react-auth"
            />
            <Spec
              n="08"
              icon={<Database className="size-4" />}
              name="IPFS"
              tag="Content · proposal bodies"
              body="Proposal text, attachments, and rationales are pinned to IPFS through an internal pin-api worker. The ledger keeps the hash; the network keeps the bytes."
              foot="ipfs.tech · @ipe-gov/ipfs"
            />
            <Spec
              n="09"
              icon={<Network className="size-4" />}
              name="Sepolia"
              tag="Chain · testnet pilot"
              body="The pilot runs on Ethereum Sepolia. Cheap, public, disposable — a place to learn the institution before the institution has to be permanent."
              foot="ethereum.org · chainId 11155111"
            />
          </ol>

          <div className="mt-6 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 sm:gap-x-8">
            <p>
              <span className="font-mono uppercase tracking-[0.2em] text-foreground">
                Note ·
              </span>{' '}
              Addresses & ABIs are centralized in{' '}
              <code className="rounded-sm border border-dashed border-border bg-muted/50 px-1 py-0.5 font-mono text-[11px]">
                @ipe-gov/sdk
              </code>{' '}
              so app, workers, and contracts read from one source of truth.
            </p>
            <p>
              <span className="font-mono uppercase tracking-[0.2em] text-foreground">
                Off-chain ·
              </span>{' '}
              Cloudflare Workers proxy the FHE relayer, IPFS pinning, ENS
              subname issuance, and a chain-aware paymaster RPC.
            </p>
          </div>
        </div>
      </section>

      {/* Two doors */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeading kicker="Two doors" title="Pick the one that fits." />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Door
              role="Architect"
              tagline="You hold a key. You hold a vote."
              body="Members of the village charter. Propose motions, cast encrypted ballots, read the full ledger."
              cta="Open proposals"
              to="/proposals"
              accent
            />
            <Door
              role="Explorer"
              tagline="Pass through. Look around."
              body="No key, no vote — but the public motions, member roster, and FHE primer are all open to read."
              cta="Browse members"
              to="/members"
            />
          </div>
        </div>
      </section>

      {/* Colophon */}
      <section className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Set in serif & mono · ledger no. 001 · {EDITION_DATE}</span>
          <span className="hidden sm:inline">———————————</span>
          <span>Printed on-chain · Sepolia · v0</span>
        </div>
      </section>
    </main>
  )
}

/* —————————————————————————————————————————————————— */

function Masthead() {
  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:px-6 sm:text-[11px]">
        <span className="truncate">Ipê Village · Parallel Institutions</span>
        <span className="hidden text-foreground/70 sm:inline">
          {EDITION_DATE}
        </span>
        <span className="shrink-0">No. 001</span>
      </div>
    </div>
  )
}

function LedgerRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {k}
      </dt>
      <dd className="text-right text-sm text-foreground">{v}</dd>
    </div>
  )
}

function SectionHeading({
  kicker,
  title,
}: {
  kicker: string
  title: string
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-12 sm:items-end">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:col-span-3">
        {kicker}
      </div>
      <h2 className="font-serif text-2xl leading-[1.05] tracking-tight text-foreground sm:col-span-9 sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
    </div>
  )
}

function Pillar({
  n,
  icon,
  title,
  body,
}: {
  n: string
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="group relative bg-background p-6 transition-colors hover:bg-muted/40 sm:p-7">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          {n}
        </span>
        <span className="grid size-7 place-items-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-foreground group-hover:text-foreground">
          {icon}
        </span>
      </div>
      <h3 className="mt-6 font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
        {body}
      </p>
    </div>
  )
}

function DiagramStep({
  n,
  label,
  detail,
  kind,
  token,
}: {
  n: string
  label: string
  detail: string
  kind: 'plain' | 'cipher'
  token: string
}) {
  return (
    <li className="relative flex flex-col rounded-md border border-border bg-background p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          STEP·{n}
        </span>
        <span
          className={
            'rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ' +
            (kind === 'cipher'
              ? 'bg-foreground text-background'
              : 'border border-border text-muted-foreground')
          }
        >
          {kind === 'cipher' ? 'sealed' : 'plain'}
        </span>
      </div>
      <div className="mt-4 font-serif text-xl tracking-tight text-foreground sm:text-2xl">
        {label}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{detail}</div>
      <div
        className={
          'mt-4 truncate rounded-sm px-2.5 py-2 font-mono text-[11px] tracking-wider ' +
          (kind === 'cipher'
            ? 'bg-foreground/95 text-background'
            : 'border border-dashed border-border text-foreground')
        }
        aria-hidden
      >
        {token}
      </div>
    </li>
  )
}

function Spec({
  n,
  icon,
  name,
  tag,
  body,
  foot,
}: {
  n: string
  icon: React.ReactNode
  name: string
  tag: string
  body: string
  foot: string
}) {
  return (
    <li className="group relative flex flex-col gap-3 bg-background p-5 transition-colors hover:bg-muted/40 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            №·{n}
          </span>
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-foreground group-hover:text-foreground"
          >
            {icon}
          </span>
        </div>
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {tag}
        </span>
      </div>
      <div className="font-serif text-2xl tracking-tight text-foreground sm:text-[1.75rem]">
        {name}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
        {body}
      </p>
      <div className="mt-1 border-t border-dashed border-border pt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {foot}
      </div>
    </li>
  )
}

function Door({
  role,
  tagline,
  body,
  cta,
  to,
  accent,
}: {
  role: string
  tagline: string
  body: string
  cta: string
  to: string
  accent?: boolean
}) {
  return (
    <Link
      to={to}
      className={
        'group relative flex flex-col justify-between overflow-hidden rounded-md border p-6 transition-all sm:p-8 ' +
        (accent
          ? 'border-foreground bg-foreground text-background hover:-translate-y-0.5'
          : 'border-border bg-background hover:-translate-y-0.5 hover:border-foreground')
      }
    >
      <div>
        <div
          className={
            'font-mono text-[10px] uppercase tracking-[0.24em] ' +
            (accent ? 'text-background/70' : 'text-muted-foreground')
          }
        >
          For the {role.toLowerCase()}
        </div>
        <h3
          className={
            'mt-2 font-serif text-3xl leading-tight tracking-tight sm:text-4xl ' +
            (accent ? '' : 'text-foreground')
          }
        >
          {role}
        </h3>
        <p
          className={
            'mt-2 font-serif text-lg italic ' +
            (accent ? 'text-background/80' : 'text-muted-foreground')
          }
        >
          {tagline}
        </p>
        <p
          className={
            'mt-5 max-w-md text-sm leading-relaxed sm:text-[15px] ' +
            (accent ? 'text-background/85' : 'text-muted-foreground')
          }
        >
          {body}
        </p>
      </div>
      <div
        className={
          'mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] ' +
          (accent ? 'text-background' : 'text-foreground')
        }
      >
        {cta}
        <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  )
}

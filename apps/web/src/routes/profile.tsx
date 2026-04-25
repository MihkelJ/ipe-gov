import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Check,
  Copy,
  ExternalLink,
  Github,
  ImagePlus,
  Loader2,
  Sparkles,
  Twitter,
  Upload,
  UserCircle2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ENS_PARENT_NAME } from '@ipe-gov/sdk'
import RequireUnlockMembership from '#/components/RequireUnlockMembership'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { cn } from '#/lib/utils'
import { useAvatarUpload } from '#/hooks/useAvatarUpload'
import { useEnsTextRecords } from '#/hooks/useEnsTextRecords'
import {
  useSubnameAvailability,
  normalizeLabelInput,
} from '#/hooks/useSubnameAvailability'
import { useSubnameClaim } from '#/hooks/useSubnameClaim'
import { useSubnameIdentity } from '#/hooks/useSubnameIdentity'
import { useSubnameSetTextRecords } from '#/hooks/useSubnameRecords'
import { truncateAddress } from '#/lib/address'
import type { SubnameIdentity } from '#/lib/ensApi'

export const Route = createFileRoute('/profile')({
  head: () => ({ meta: [{ title: 'Your name — ipe-gov' }] }),
  component: ProfileGuarded,
})

function ProfileGuarded() {
  return (
    <RequireUnlockMembership>
      <ProfilePage />
    </RequireUnlockMembership>
  )
}

const EYEBROW =
  'font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground'
const SECTION_HEADING =
  'font-mono text-[11px] uppercase tracking-[0.2em] text-foreground'

function ProfilePage() {
  const { address } = useAccount()
  const { data: identity, isLoading } = useSubnameIdentity(address)

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-32 pt-10 sm:px-6 md:pt-16">
      <PageHeader address={address} identity={identity ?? null} />

      <section className="mt-10 md:mt-14">
        {isLoading ? (
          <div className={cn(EYEBROW, 'animate-pulse')}>Loading dossier…</div>
        ) : identity ? (
          <ClaimedView address={address} identity={identity} />
        ) : (
          <UnclaimedView />
        )}
      </section>
    </main>
  )
}

/* ─────────────────────────  Header  ───────────────────────── */

function PageHeader({
  address,
  identity,
}: {
  address: string | undefined
  identity: SubnameIdentity | null
}) {
  return (
    <header className="border-b pb-8 md:pb-10">
      <div className={EYEBROW}>§ Identity / Member dossier</div>
      <h1 className="mt-4 text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.02] tracking-tight">
        <span className="text-muted-foreground">A name on </span>
        <span className="break-all">{ENS_PARENT_NAME}</span>
      </h1>

      {/* Passport strip: scrolls horizontally on phones, fans out on md+ so it
          never crams into a 2-col grid that truncates everything. */}
      <dl
        className={cn(
          'mt-7 flex gap-x-6 gap-y-3 overflow-x-auto pb-1 font-mono text-xs',
          'md:grid md:grid-cols-4 md:gap-x-8 md:overflow-visible',
        )}
      >
        {(
          [
            ['Issuer', ENS_PARENT_NAME],
            ['Registry', 'ENS NameWrapper'],
            ['Status', identity ? 'Claimed' : 'Unclaimed'],
            ['Holder', address ? truncateAddress(address as `0x${string}`) : '—'],
          ] as Array<[string, string]>
        ).map(([k, v]) => (
          <div
            key={k}
            className="flex min-w-[8.5rem] shrink-0 flex-col gap-1 border-t pt-2 md:min-w-0"
          >
            <dt className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {k}
            </dt>
            <dd className="truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </header>
  )
}

/* ─────────────────────────  Unclaimed  ───────────────────────── */

function UnclaimedView() {
  const [label, setLabel] = useState('')
  const availability = useSubnameAvailability(label)
  const { mutateAsync: claim, isPending, error } = useSubnameClaim()
  const [done, setDone] = useState<string | null>(null)

  const normalized = normalizeLabelInput(label)
  const canSubmit =
    availability.status === 'available' && !isPending && !!normalized
  const isInvalid =
    availability.status === 'invalid' || availability.status === 'taken'
  const isAvailable = availability.status === 'available'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!normalized) return
    setDone(null)
    const result = await claim({ label: normalized })
    setDone(result.fullName)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <div>
        <Label htmlFor="label" className={EYEBROW}>
          01 / Type your label
        </Label>

        {/* Mobile: stack label-input above the suffix so long names don't
            scroll horizontally. Desktop: inline, with the suffix muted. */}
        <div
          className={cn(
            'mt-5 font-mono leading-tight tracking-tight',
            'flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:gap-0 sm:whitespace-nowrap',
            'text-[clamp(1.65rem,7vw,3rem)] font-medium',
          )}
        >
          <span
            className={cn(
              'inline-flex w-full max-w-full border-b-2 pb-1 transition-colors sm:w-auto',
              isInvalid
                ? 'border-destructive'
                : isAvailable
                  ? 'border-emerald-700/70 dark:border-emerald-500/70'
                  : 'border-foreground/30 focus-within:border-foreground',
            )}
          >
            <input
              id="label"
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="your-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-invalid={isInvalid}
              className={cn(
                'min-w-0 w-full bg-transparent p-0 outline-none caret-foreground',
                'placeholder:text-muted-foreground/40',
                isInvalid && 'text-destructive',
              )}
            />
          </span>
          <span className="text-muted-foreground/60">.{ENS_PARENT_NAME}</span>
        </div>

        <div className="mt-4 min-h-[1.25rem] font-mono text-xs">
          <AvailabilityHint state={availability} />
        </div>
      </div>

      <Card className="border-dashed bg-muted/20 py-5 shadow-none">
        <CardContent className="flex flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Sponsored claim</div>
              <p className="text-xs text-muted-foreground">
                One signature. No gas. No chain switch.
              </p>
            </div>
          </div>
          <Button type="submit" size="lg" disabled={!canSubmit} className="sm:shrink-0">
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Claiming…
              </>
            ) : (
              <>Claim →</>
            )}
          </Button>
        </CardContent>
      </Card>

      {done ? (
        <p className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
          ✓&nbsp;&nbsp;{done} issued.
        </p>
      ) : null}
      {error ? (
        <p className="font-mono text-xs text-destructive">
          ✕&nbsp;&nbsp;{(error as Error).message}
        </p>
      ) : null}
    </form>
  )
}

/* ─────────────────────────  Claimed  ───────────────────────── */

const TEXT_RECORD_FIELDS: Array<{
  key: string
  label: string
  placeholder: string
  description?: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  {
    key: 'avatar',
    label: 'Avatar',
    placeholder: 'https://… or ipfs://… or eip155:…',
    description: 'HTTPS, IPFS, or ENS NFT avatar URI.',
    icon: ImagePlus,
  },
  {
    key: 'description',
    label: 'Bio',
    placeholder: 'A short line about you',
    icon: UserCircle2,
  },
  { key: 'com.github', label: 'GitHub', placeholder: 'alice', icon: Github },
  { key: 'com.twitter', label: 'X / Twitter', placeholder: 'alice', icon: Twitter },
]

const TEXT_RECORD_KEYS = TEXT_RECORD_FIELDS.map((f) => f.key) as readonly string[]

function ClaimedView({
  address,
  identity,
}: {
  address: string | undefined
  identity: SubnameIdentity
}) {
  const { data: existingRecords } = useEnsTextRecords(
    identity.fullName,
    TEXT_RECORD_KEYS,
  )

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_RECORD_FIELDS.map((f) => [f.key, ''])),
  )
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [savedCount, setSavedCount] = useState<number | null>(null)

  useEffect(() => {
    if (!existingRecords) return
    setValues((current) => {
      const next = { ...current }
      for (const f of TEXT_RECORD_FIELDS) {
        if (!dirty.has(f.key)) {
          next[f.key] = existingRecords[f.key] ?? ''
        }
      }
      return next
    })
  }, [existingRecords, dirty])

  const {
    mutateAsync: setRecords,
    isPending,
    error,
  } = useSubnameSetTextRecords({ node: identity.node })

  function updateField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
    setDirty((d) => new Set(d).add(key))
  }

  const {
    mutateAsync: uploadAvatar,
    isPending: isUploading,
    error: uploadError,
  } = useAvatarUpload()

  async function handleAvatarFile(file: File) {
    const result = await uploadAvatar(file)
    updateField('avatar', result.uri)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (dirty.size === 0) return
    const updates = [...dirty].map((key) => ({ key, value: values[key] ?? '' }))
    setSavedCount(null)
    await setRecords(updates)
    setSavedCount(updates.length)
    setDirty(new Set())
  }

  const filledCount = useMemo(
    () => TEXT_RECORD_FIELDS.filter((f) => (values[f.key] ?? '').trim().length > 0).length,
    [values],
  )
  const completion = Math.round((filledCount / TEXT_RECORD_FIELDS.length) * 100)
  const avatarPreview = avatarPreviewSrc(values.avatar ?? '')

  return (
    <div className="space-y-10 md:space-y-14">
      {/* Identity hero card */}
      <Card className="overflow-hidden py-0 shadow-none">
        <CardContent className="grid grid-cols-1 gap-6 p-6 sm:p-8 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-8">
          <Avatar className="size-20 rounded-2xl sm:size-24">
            {avatarPreview ? (
              <AvatarImage
                src={avatarPreview}
                alt={identity.fullName}
                className="rounded-2xl object-cover"
              />
            ) : null}
            <AvatarFallback className="rounded-2xl font-mono text-base uppercase tracking-wider">
              {identity.label.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 space-y-3">
            <div className={EYEBROW}>01 / Name issued</div>
            <h2 className="break-all font-mono text-[clamp(1.4rem,5.5vw,2.25rem)] font-medium leading-[1.05] tracking-tight">
              <span>{identity.label}</span>
              <span className="text-muted-foreground/60">.{ENS_PARENT_NAME}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.18em]">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Active
              </Badge>
              {address ? (
                <Badge
                  variant="ghost"
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {truncateAddress(address as `0x${string}`)}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch md:justify-self-end">
            <CopyButton value={identity.fullName} label="Copy name" />
            {address ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  to="/members/$address"
                  params={{ address }}
                  className="gap-1.5"
                >
                  <ExternalLink className="size-3.5" />
                  Public dossier
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Records form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className={SECTION_HEADING}>§&nbsp;02&nbsp;&nbsp;Profile records</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Text records resolve via mainnet PublicResolver. One signature commits all changes.
            </p>
          </div>
          <CompletionMeter
            filled={filledCount}
            total={TEXT_RECORD_FIELDS.length}
            percent={completion}
            dirty={dirty.size}
          />
        </div>

        <Card className="overflow-hidden py-0 shadow-none">
          <ol className="divide-y">
            {TEXT_RECORD_FIELDS.map((f, i) => {
              const Icon = f.icon
              const value = values[f.key] ?? ''
              const isDirty = dirty.has(f.key)
              return (
                <li
                  key={f.key}
                  className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 py-5 md:grid-cols-[14rem_1fr] md:px-6 md:py-6"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] uppercase tracking-[0.22em]">
                        <span className="text-muted-foreground">
                          {String(i + 1).padStart(2, '0')} —{' '}
                        </span>
                        <span>{f.label}</span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
                        {f.key}
                      </div>
                    </div>
                    {isDirty ? (
                      <Badge
                        variant="outline"
                        className="ml-auto font-mono text-[9px] uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400"
                      >
                        Edited
                      </Badge>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    {f.key === 'avatar' ? (
                      <AvatarField
                        value={value}
                        onChange={(v) => updateField('avatar', v)}
                        onUpload={handleAvatarFile}
                        isUploading={isUploading}
                        uploadError={uploadError as Error | null}
                      />
                    ) : (
                      <Input
                        id={f.key}
                        placeholder={f.placeholder}
                        value={value}
                        onChange={(e) => updateField(f.key, e.target.value)}
                      />
                    )}
                    {f.description ? (
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {f.description}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>

        {/* Inline (desktop) action row */}
        <div className="hidden items-center justify-between sm:flex">
          <div className={cn(EYEBROW, 'max-w-xs')}>
            {dirty.size > 0
              ? `${dirty.size} pending change${dirty.size === 1 ? '' : 's'}`
              : 'All changes saved'}
          </div>
          <Button type="submit" disabled={isPending || dirty.size === 0}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              <>Save {dirty.size || ''} →</>
            )}
          </Button>
        </div>

        {savedCount !== null ? (
          <p className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
            ✓&nbsp;&nbsp;Saved {savedCount} record{savedCount === 1 ? '' : 's'}.
          </p>
        ) : null}
        {error ? (
          <p className="font-mono text-xs text-destructive">
            ✕&nbsp;&nbsp;{(error as Error).message}
          </p>
        ) : null}

        {/* Sticky save bar (mobile only): keeps the action reachable while
            scrolling through records. Desktop uses the inline row above. */}
        {dirty.size > 0 ? (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {dirty.size} pending
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="min-w-[7rem]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>Save →</>
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </form>
    </div>
  )
}

/* ─────────────────────────  Helpers  ───────────────────────── */

function CompletionMeter({
  filled,
  total,
  percent,
  dirty,
}: {
  filled: number
  total: number
  percent: number
  dirty: number
}) {
  return (
    <div className="w-full max-w-xs">
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>
          {filled} / {total} filled
        </span>
        <span>{dirty > 0 ? `${dirty} pending` : 'Saved'}</span>
      </div>
      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-foreground transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function handle() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handle}
      className="gap-1.5"
      aria-label={label}
    >
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
  )
}

function avatarPreviewSrc(value: string): string | null {
  if (!value) return null
  if (value.startsWith('ipfs://')) {
    return `https://gateway.pinata.cloud/ipfs/${value.slice('ipfs://'.length)}`
  }
  if (value.startsWith('https://') || value.startsWith('http://')) return value
  return null
}

function AvatarField({
  value,
  onChange,
  onUpload,
  isUploading,
  uploadError,
}: {
  value: string
  onChange: (v: string) => void
  onUpload: (file: File) => Promise<void> | void
  isUploading: boolean
  uploadError: Error | null
}) {
  const previewSrc = avatarPreviewSrc(value)

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <label
          className={cn(
            'group relative flex size-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30 transition-colors',
            'hover:border-foreground/40 hover:bg-muted/50',
            isUploading && 'pointer-events-none opacity-60',
          )}
          aria-label="Upload avatar image"
        >
          {previewSrc ? (
            <>
              <img
                src={previewSrc}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
                <Upload className="size-4" />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground transition-colors group-hover:text-foreground">
              <ImagePlus aria-hidden className="size-5" />
              <span className="font-mono text-[9px] uppercase tracking-[0.18em]">
                Upload
              </span>
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={isUploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) onUpload(f)
            }}
          />
        </label>
        <div className="flex-1 space-y-2">
          <Input
            id="avatar"
            placeholder="https://… or ipfs://… or eip155:…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {isUploading ? (
            <p className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Pinning to IPFS…
            </p>
          ) : null}
          {uploadError ? (
            <p className="font-mono text-[10px] text-destructive">
              ✕&nbsp;&nbsp;{uploadError.message}
            </p>
          ) : null}
        </div>
      </div>
      <Separator className="opacity-40" />
    </div>
  )
}

function AvailabilityHint({
  state,
}: {
  state: ReturnType<typeof useSubnameAvailability>
}) {
  if (state.status === 'idle')
    return (
      <span className="text-muted-foreground/70">
        ▸&nbsp;&nbsp;Type to check availability.
      </span>
    )
  if (state.status === 'invalid')
    return (
      <span className="text-destructive">
        ✕&nbsp;&nbsp;{state.reason}.
      </span>
    )
  if (state.status === 'loading')
    return (
      <span className="text-muted-foreground">
        ◔&nbsp;&nbsp;Checking {state.label}.{ENS_PARENT_NAME}…
      </span>
    )
  if (state.status === 'available')
    return (
      <span className="text-emerald-700 dark:text-emerald-400">
        ✓&nbsp;&nbsp;{state.label}.{ENS_PARENT_NAME} is available.
      </span>
    )
  if (state.status === 'taken')
    return (
      <span className="text-destructive">
        ✕&nbsp;&nbsp;{state.label}.{ENS_PARENT_NAME} is already taken.
      </span>
    )
  return (
    <span className="text-destructive">
      ✕&nbsp;&nbsp;Couldn&apos;t check availability: {state.error}
    </span>
  )
}

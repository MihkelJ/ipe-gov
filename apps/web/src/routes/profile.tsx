import { createFileRoute } from '@tanstack/react-router'
import { ImagePlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { ENS_PARENT_NAME } from '@ipe-gov/sdk'
import RequireUnlockMembership from '#/components/RequireUnlockMembership'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
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

const EYEBROW = 'font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground'

function ProfilePage() {
  const { address } = useAccount()
  const { data: identity, isLoading } = useSubnameIdentity(address)

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24 pt-16 md:pt-24">
      <header className="mb-16 grid grid-cols-12 items-end gap-x-8 gap-y-6 border-b pb-10">
        <div className="col-span-12 md:col-span-8">
          <div className={EYEBROW}>§ Identity / Member dossier</div>
          <h1 className="mt-5 text-5xl font-semibold leading-[0.95] tracking-tight md:text-6xl">
            <span className="text-muted-foreground">A name on </span>
            <span>{ENS_PARENT_NAME}</span>
          </h1>
        </div>
        <DossierMeta address={address} identity={identity ?? null} />
      </header>

      <section className="mx-auto max-w-3xl">
        {isLoading ? (
          <p className={EYEBROW}>Loading dossier…</p>
        ) : identity ? (
          <ClaimedView identity={identity} />
        ) : (
          <UnclaimedView />
        )}
      </section>
    </main>
  )
}

/** Right-aligned passport-style key/value strip in the page header. */
function DossierMeta({
  address,
  identity,
}: {
  address: string | undefined
  identity: SubnameIdentity | null
}) {
  const rows: Array<[string, string]> = [
    ['Issuer', ENS_PARENT_NAME],
    ['Registry', 'ENS NameWrapper'],
    ['Status', identity ? 'Claimed' : 'Unclaimed'],
    ['Holder', address ? truncateAddress(address as `0x${string}`) : '—'],
  ]
  return (
    <dl className="col-span-12 grid grid-cols-2 gap-x-6 gap-y-3 self-end font-mono text-xs md:col-span-4 md:grid-cols-1 md:gap-y-2">
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="flex items-baseline justify-between gap-3 border-t pt-2 md:border-t md:pt-2"
        >
          <dt className="text-muted-foreground uppercase tracking-[0.18em] text-[10px]">{k}</dt>
          <dd className="truncate">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function UnclaimedView() {
  const [label, setLabel] = useState('')
  const availability = useSubnameAvailability(label)
  const { mutateAsync: claim, isPending, error } = useSubnameClaim()
  const [done, setDone] = useState<string | null>(null)

  const canSubmit =
    availability.status === 'available' &&
    !isPending &&
    !!normalizeLabelInput(label)

  const placeholder = 'your-label'
  const isInvalid =
    availability.status === 'invalid' || availability.status === 'taken'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizeLabelInput(label)
    if (!normalized) return
    setDone(null)
    const result = await claim({ label: normalized })
    setDone(result.fullName)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <Label htmlFor="label" className={EYEBROW}>
          01 / Type your label
        </Label>

        {/* The input IS the typography, but at a sensible size so the full
            name fits one line for typical inputs. Underline anchors only the
            editable portion so it reads as a field, not a heading. */}
        <div className="mt-5 flex items-baseline whitespace-nowrap overflow-x-auto font-mono text-[clamp(1.75rem,4.5vw,3rem)] font-medium leading-tight tracking-tight">
          <span
            className={cn(
              'inline-flex border-b-2 pb-1 transition-colors',
              isInvalid
                ? 'border-destructive'
                : availability.status === 'available'
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
              placeholder={placeholder}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-invalid={isInvalid}
              size={Math.max(label.length || placeholder.length, 1)}
              className={cn(
                'min-w-0 border-0 bg-transparent p-0 outline-none caret-foreground',
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

      <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className={cn(EYEBROW, 'max-w-xs')}>
          One signature. No gas. No chain switch.
        </div>
        <Button type="submit" size="lg" disabled={!canSubmit}>
          {isPending ? 'Claiming…' : 'Claim →'}
        </Button>
      </div>

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

const TEXT_RECORD_FIELDS: Array<{
  key: string
  label: string
  placeholder: string
  description?: string
}> = [
  {
    key: 'avatar',
    label: 'Avatar',
    placeholder: 'https://… or ipfs://… or eip155:…',
    description: 'HTTPS, IPFS, or ENS NFT avatar URI.',
  },
  { key: 'description', label: 'Bio', placeholder: 'Short description' },
  { key: 'com.github', label: 'GitHub handle', placeholder: 'alice' },
  { key: 'com.twitter', label: 'X / Twitter handle', placeholder: 'alice' },
]

const TEXT_RECORD_KEYS = TEXT_RECORD_FIELDS.map((f) => f.key) as readonly string[]

function ClaimedView({ identity }: { identity: SubnameIdentity }) {
  // Records live on mainnet PublicResolver. Read existing values via viem so
  // the editor opens with the user's current profile filled in instead of
  // empty fields they'd accidentally clobber.
  const { data: existingRecords } = useEnsTextRecords(
    identity.fullName,
    TEXT_RECORD_KEYS,
  )

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_RECORD_FIELDS.map((f) => [f.key, ''])),
  )
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [savedCount, setSavedCount] = useState<number | null>(null)

  // When the mainnet read resolves (or refreshes after a save), seed any
  // field the user hasn't touched. Touched fields stay editable mid-flight.
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

  return (
    <div className="space-y-10">
      <div>
        <div className={EYEBROW}>01 / Name issued</div>
        <div className="mt-5 flex items-baseline whitespace-nowrap overflow-x-auto font-mono text-[clamp(1.75rem,4.5vw,3rem)] font-medium leading-tight tracking-tight">
          <span>{identity.label}</span>
          <span className="text-muted-foreground/60">.{ENS_PARENT_NAME}</span>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="mb-4 flex items-baseline justify-between border-t pt-5">
          <div className={EYEBROW}>02 / Profile records</div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {dirty.size > 0 ? `${dirty.size} pending` : 'Saved'}
          </div>
        </div>

        <ol className="divide-y border-b">
          {TEXT_RECORD_FIELDS.map((f, i) => (
            <li
              key={f.key}
              className="grid grid-cols-12 gap-x-5 gap-y-2 py-4"
            >
              <div className="col-span-12 md:col-span-3">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em]">
                  <span className="text-muted-foreground">
                    {String(i + 1).padStart(2, '0')} —{' '}
                  </span>
                  <span>{f.label}</span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                  {f.key}
                </div>
              </div>
              <div className="col-span-12 md:col-span-9 space-y-1.5">
                {f.key === 'avatar' ? (
                  <AvatarField
                    value={values[f.key] ?? ''}
                    onChange={(v) => updateField('avatar', v)}
                    onUpload={handleAvatarFile}
                    isUploading={isUploading}
                    uploadError={uploadError as Error | null}
                  />
                ) : (
                  <Input
                    id={f.key}
                    placeholder={f.placeholder}
                    value={values[f.key] ?? ''}
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
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className={cn(EYEBROW, 'max-w-xs')}>
            One signature commits all changes.
          </div>
          <Button type="submit" disabled={isPending || dirty.size === 0}>
            {isPending ? 'Saving…' : `Save ${dirty.size || ''} →`.replace(/\s+/g, ' ')}
          </Button>
        </div>

        {savedCount !== null ? (
          <p className="mt-4 font-mono text-xs text-emerald-700 dark:text-emerald-400">
            ✓&nbsp;&nbsp;Saved {savedCount} record{savedCount === 1 ? '' : 's'}.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 font-mono text-xs text-destructive">
            ✕&nbsp;&nbsp;{(error as Error).message}
          </p>
        ) : null}
      </form>
    </div>
  )
}

/** Convert ENS-spec avatar URIs to something an `<img>` can render. We
 *  handle ipfs:// and https:// here; eip155 / data: / unknown schemes fall
 *  back to no preview rather than misrendering. */
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
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <label
          className={cn(
            'group relative flex size-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border bg-muted/30 transition-colors',
            'hover:border-foreground/40 hover:bg-muted/50',
            isUploading && 'pointer-events-none opacity-60',
          )}
          aria-label="Upload avatar image"
        >
          {previewSrc ? (
            <img
              src={previewSrc}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <ImagePlus
              aria-hidden
              className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
            />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={isUploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = '' // allow re-uploading the same file
              if (f) onUpload(f)
            }}
          />
        </label>
        <div className="flex-1 space-y-1.5">
          <Input
            id="avatar"
            placeholder="https://… or ipfs://… or eip155:…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {isUploading ? (
            <p className="font-mono text-[10px] text-muted-foreground">
              ◔&nbsp;&nbsp;Pinning to IPFS…
            </p>
          ) : null}
          {uploadError ? (
            <p className="font-mono text-[10px] text-destructive">
              ✕&nbsp;&nbsp;{uploadError.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function AvailabilityHint({
  state,
}: {
  state: ReturnType<typeof useSubnameAvailability>
}) {
  if (state.status === 'idle')
    return <span className="text-muted-foreground/70">▸&nbsp;&nbsp;Type to check availability.</span>
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

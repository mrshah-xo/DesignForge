'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { request } from '@/lib/client/api'

// ---------- Types (mirror the server response) ----------

interface SecretStatus {
  name: string
  label: string
  description: string
  sensitive: boolean
  set: boolean
  source: 'local-file' | 'environment' | 'not-set'
  masked?: string
  shadowed: boolean
}

interface SecretsResponse {
  writable: boolean
  secrets: SecretStatus[]
  note?: string | null
}

// ---------- Component ----------

export function SecretsPanel() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [writable, setWritable] = useState(true)
  const [note, setNote] = useState<string | null>(null)
  const [secrets, setSecrets] = useState<SecretStatus[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({})
  const [customName, setCustomName] = useState('')
  const [customValue, setCustomValue] = useState('')
  // Refetch timers must survive unmount of the triggering interaction.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await request<SecretsResponse>('/api/settings/secrets')
      setWritable(data.writable)
      setNote(data.note ?? null)
      setSecrets(data.secrets)
    } catch (err) {
      if (!silent) {
        toast.error('Could not load secret statuses', {
          description: err instanceof Error ? err.message : 'Request failed',
        })
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // The dev server hot-reloads .env.local after a write; fetch once now and
  // again shortly after to catch the post-reload state.
  const scheduleRefresh = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = [
      setTimeout(() => void load(true), 1200),
      setTimeout(() => void load(true), 3200),
    ]
  }, [load])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const save = async (name: string) => {
    const value = (drafts[name] ?? '').trim()
    if (!value) return
    setSavingKeys((s) => ({ ...s, [name]: true }))
    try {
      const data = await request<{ ok: boolean; secrets: SecretStatus[] }>(
        '/api/settings/secrets',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: { [name]: value } }),
        },
      )
      setSecrets(data.secrets)
      setDrafts((d) => ({ ...d, [name]: '' }))
      toast.success(`${name} saved`, {
        description: 'Stored in .env.local (git-ignored). The dev server reloads it automatically.',
      })
      scheduleRefresh()
    } catch (err) {
      toast.error(`Could not save ${name}`, {
        description: err instanceof Error ? err.message : 'Request failed',
      })
    } finally {
      setSavingKeys((s) => ({ ...s, [name]: false }))
    }
  }

  const remove = async (name: string) => {
    setSavingKeys((s) => ({ ...s, [name]: true }))
    try {
      const data = await request<{ ok: boolean; secrets: SecretStatus[] }>(
        '/api/settings/secrets',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: { [name]: null } }),
        },
      )
      setSecrets(data.secrets)
      toast.success(`${name} removed from .env.local`)
      scheduleRefresh()
    } catch (err) {
      toast.error(`Could not remove ${name}`, {
        description: err instanceof Error ? err.message : 'Request failed',
      })
    } finally {
      setSavingKeys((s) => ({ ...s, [name]: false }))
    }
  }

  const addCustom = async () => {
    const name = customName.trim().toUpperCase()
    const value = customValue.trim()
    if (!name) {
      toast.error('Key name is required')
      return
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      toast.error('Use UPPER_SNAKE_CASE for the key name', {
        description: 'Example: OPENAI_API_KEY',
      })
      return
    }
    if (!value) {
      toast.error('Paste a value first')
      return
    }
    setSavingKeys((s) => ({ ...s, [name]: true }))
    try {
      const data = await request<{ ok: boolean; secrets: SecretStatus[] }>(
        '/api/settings/secrets',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: { [name]: value } }),
        },
      )
      setSecrets(data.secrets)
      setCustomName('')
      setCustomValue('')
      toast.success(`${name} saved`, {
        description: 'Stored in .env.local (git-ignored).',
      })
      scheduleRefresh()
    } catch (err) {
      toast.error(`Could not save ${name}`, {
        description: err instanceof Error ? err.message : 'Request failed',
      })
    } finally {
      setSavingKeys((s) => ({ ...s, [name]: false }))
    }
  }

  const sourceBadge = (s: SecretStatus) => {
    if (!s.set) return <Badge variant="outline" className="text-muted-foreground">Not set</Badge>
    if (s.source === 'local-file') {
      return (
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          .env.local
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
        Environment
      </Badge>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          aria-label="Manage API keys"
          title="Manage API keys"
        >
          <KeyRound className="size-4" />
          <span className="hidden sm:inline">API keys</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md p-0">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-ember-500" />
            API keys &amp; secrets
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">
            Paste keys once — they are stored in <code className="font-mono">.env.local</code>, a
            git-ignored file that is never committed or pushed to GitHub. Values are never sent
            back to the browser; only a masked preview is shown.
          </SheetDescription>
        </SheetHeader>

        <div className="df-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading statuses…
            </div>
          ) : !writable ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              {note ?? 'This deployment is read-only.'}
            </div>
          ) : (
            <div className="space-y-5">
              {secrets.map((s) => (
                <div key={s.name} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{s.name}</span>
                    {sourceBadge(s)}
                    {s.masked && (
                      <span className="font-mono text-[10px] text-muted-foreground">{s.masked}</span>
                    )}
                    {s.shadowed && (
                      <Badge
                        variant="outline"
                        className="border-destructive/30 bg-destructive/10 text-destructive"
                      >
                        shadowed by environment
                      </Badge>
                    )}
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                    {s.shadowed
                      ? 'A value is also exported in the server environment, which takes precedence. Remove the export to use the .env.local value.'
                      : s.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Input
                        type={revealed[s.name] ? 'text' : 'password'}
                        value={drafts[s.name] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [s.name]: e.target.value }))}
                        placeholder={s.set ? 'Replace with a new value' : `Paste ${s.label.toLowerCase()}`}
                        className="h-9 pr-9 font-mono text-xs"
                        autoComplete="off"
                        aria-label={`Paste value for ${s.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealed((r) => ({ ...r, [s.name]: !r[s.name] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={revealed[s.name] ? `Hide ${s.name} value` : `Show ${s.name} value`}
                      >
                        {revealed[s.name] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      className="h-9 shrink-0 bg-primary text-primary-foreground hover:bg-ember-600"
                      onClick={() => void save(s.name)}
                      disabled={savingKeys[s.name] || !(drafts[s.name] ?? '').trim()}
                    >
                      {savingKeys[s.name] ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
                      Save
                    </Button>
                    {s.source === 'local-file' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => void remove(s.name)}
                        disabled={savingKeys[s.name]}
                        aria-label={`Remove ${s.name} from .env.local`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Separator />

              {/* Custom keys */}
              <div className="rounded-lg border border-dashed border-border p-4">
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <Plus className="size-3.5 text-ember-500" />
                  Add a custom key
                </h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Any UPPER_SNAKE_CASE name, e.g. <code className="font-mono">OPENAI_API_KEY</code>.
                </p>
                <div className="space-y-2">
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="KEY_NAME"
                    className="h-9 font-mono text-xs"
                    aria-label="Custom key name"
                  />
                  <Input
                    type="password"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    placeholder="Paste value"
                    className="h-9 font-mono text-xs"
                    autoComplete="off"
                    aria-label="Custom key value"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 w-full"
                    onClick={() => void addCustom()}
                    disabled={savingKeys[customName.trim().toUpperCase()] || !customName.trim() || !customValue.trim()}
                  >
                    {savingKeys[customName.trim().toUpperCase()] ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Add key
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
              <Lock className="size-3 shrink-0" />
              .env.local is covered by .gitignore — verify with `git status`.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 shrink-0"
              onClick={() => void load()}
              aria-label="Refresh statuses"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

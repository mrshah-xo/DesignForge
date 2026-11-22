'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'
import {
  Check,
  Copy,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { LivePreview, FALLBACK_HEX, isHex } from '@/components/preview/live-preview'
import { themeSwatches, themeTokens } from '@/lib/preview-themes'
import { DesignGenerating } from '@/components/wizard/design-generating'
import { DESIGN_MESSAGES } from '@/components/wizard/progress-messages'
import { copyToClipboard, downloadText } from '@/lib/client/api'
import {
  FONT_OPTIONS,
  type ColorRole,
  type ColorToken,
  type DesignTokens,
  type ProjectDetail,
  type ThemeVariant,
} from '@/lib/types'

interface DesignStepProps {
  project: ProjectDetail
  saving: boolean
  generating: boolean
  onSaveTokens: (tokens: DesignTokens) => Promise<void>
  onSaveMarkdown: (markdown: string) => Promise<void>
  onRegenerate: () => Promise<void>
  onGenerateThemes: () => Promise<ThemeVariant[]>
}

const COLOR_ROLES = Object.keys(FALLBACK_HEX) as ColorRole[]

const ROLE_LABELS: Record<ColorRole, string> = {
  primary: 'Primary',
  primaryForeground: 'On primary',
  secondary: 'Secondary',
  accent: 'Accent',
  background: 'Background',
  foreground: 'Text',
  muted: 'Muted surface',
  mutedForeground: 'Muted text',
  border: 'Border',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
}

const SHADOW_PRESETS: Record<string, string> = {
  none: 'none',
  subtle: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  medium: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  strong: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
}

/** Parse "12px" / "0.75rem" etc. into px for the slider. */
function parsePx(value: string | undefined, fallback: number): number {
  const m = /(-?\d+(?:\.\d+)?)\s*(px|rem)?/.exec(value ?? '')
  if (!m) return fallback
  const n = parseFloat(m[1])
  if (Number.isNaN(n)) return fallback
  return m[2] === 'rem' ? Math.round(n * 16) : Math.round(n)
}

const roleLabel = (role: ColorRole): string =>
  ROLE_LABELS[role] ?? role.replace(/([A-Z])/g, ' $1').replace(/^./, (ch) => ch.toUpperCase())

export function DesignStep({
  project,
  saving,
  generating,
  onSaveTokens,
  onSaveMarkdown,
  onRegenerate,
  onGenerateThemes,
}: DesignStepProps) {
  const serverDesign = project.design

  const [tokens, setTokens] = useState<DesignTokens | null>(serverDesign?.tokens ?? null)
  const [markdown, setMarkdown] = useState(serverDesign?.markdown ?? '')
  const [hexDrafts, setHexDrafts] = useState<Partial<Record<ColorRole, string>>>({})

  // ---------- AI theme directions + light/dark presets (live preview switcher) ----------
  const [themes, setThemes] = useState<ThemeVariant[]>(project.themes ?? [])
  const [themesLoading, setThemesLoading] = useState(false)
  // activeThemeId selects: 'original' | 'light' | 'dark' | a ThemeVariant id
  const [activeThemeId, setActiveThemeId] = useState<string>('original')
  const [applyingTheme, setApplyingTheme] = useState(false)

  // Editors are initialized once at mount; the shell remounts this step
  // (keyed by project id + design nonce) when the design is regenerated,
  // so no setState-in-effect sync is needed. Manual saves already match
  // the local state, and step switches remount the component anyway.

  // ---------- Regeneration in progress ----------
  if (generating) {
    return (
      <div className="rounded-lg border border-border bg-card shadow-sm">
        <DesignGenerating messages={DESIGN_MESSAGES} />
      </div>
    )
  }

  if (!tokens || !serverDesign) {
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        No design system generated yet — approve the research in step 4 first.
      </p>
    )
  }

  const roleHex = (role: ColorRole): string => {
    const hex = tokens.colors?.[role]?.hex
    return isHex(hex) ? hex : FALLBACK_HEX[role]
  }

  // ---------- Theme switcher helpers ----------
  const bestThemeId =
    themes.length > 0
      ? themes.reduce((best, t) => (t.score > best.score ? t : best), themes[0]).id
      : null
  const activePreset: 'light' | 'dark' | null =
    activeThemeId === 'light' || activeThemeId === 'dark' ? activeThemeId : null
  const activeTheme = activeThemeId === 'original' || activePreset
    ? null
    : themes.find((t) => t.id === activeThemeId) ?? null
  const previewTokens = activeTheme
    ? activeTheme.tokens
    : activePreset
      ? themeTokens(tokens, activePreset, null)
      : tokens

  const handleGenerateThemes = () => {
    setThemesLoading(true)
    setActiveThemeId('original')
    onGenerateThemes()
      .then((list) => setThemes(list))
      .catch(() => {
        /* error already surfaced by the shell toast */
      })
      .finally(() => setThemesLoading(false))
  }

  const applyTheme = (theme: ThemeVariant) => {
    setApplyingTheme(true)
    Promise.resolve(onSaveTokens(theme.tokens))
      .then(() => {
        setTokens(theme.tokens)
        setActiveThemeId('original')
        toast.success(`Theme "${theme.name}" applied`, {
          description: 'DESIGN.md still describes the previous direction — use Regenerate with AI (Visual editor tab) or edit it to refresh the copy.',
        })
      })
      .catch(() => {
        /* error already surfaced by the shell toast */
      })
      .finally(() => setApplyingTheme(false))
  }

  /** Apply a light/dark preset: persists the derived tokens as the new design. */
  const applyPreset = () => {
    if (!activePreset) return
    const label = activePreset === 'light' ? 'Light' : 'Dark'
    const next = themeTokens(tokens, activePreset, null)
    setApplyingTheme(true)
    Promise.resolve(onSaveTokens(next))
      .then(() => {
        setTokens(next)
        setActiveThemeId('original')
        toast.success(`${label} theme applied`, {
          description: 'Same brand colors, remapped surfaces. DESIGN.md still describes the previous direction — regenerate it to refresh the copy.',
        })
      })
      .catch(() => {
        /* error already surfaced by the shell toast */
      })
      .finally(() => setApplyingTheme(false))
  }

  const previewPill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
      active
        ? 'border-ember-300 bg-ember-50 text-ember-800 dark:border-ember-500/40 dark:bg-ember-500/10 dark:text-ember-300'
        : 'border-border bg-transparent text-muted-foreground hover:bg-muted/60'
    }`

  const patchColor = (role: ColorRole, hex: string) => {
    setTokens((t) => {
      if (!t) return t
      const existing: ColorToken = t.colors?.[role] ?? { name: roleLabel(role), usage: '' }
      return { ...t, colors: { ...t.colors, [role]: { ...existing, hex } } }
    })
  }

  const patchRadius = (key: 'sm' | 'md' | 'lg', px: number) => {
    setTokens((t) => (t ? { ...t, radius: { ...t.radius, [key]: `${px}px` } } : t))
  }

  const applyShadowPreset = (preset: string) => {
    const css = SHADOW_PRESETS[preset]
    if (css === undefined) return
    setTokens((t) => (t ? { ...t, shadows: { sm: css, md: css, lg: css } } : t))
  }

  const currentShadowPreset =
    Object.entries(SHADOW_PRESETS).find(([, css]) => css === tokens.shadows?.sm)?.[0] ?? 'subtle'

  const familyOptions = (family: string): readonly string[] =>
    (FONT_OPTIONS as readonly string[]).includes(family) ? FONT_OPTIONS : [family, ...FONT_OPTIONS]

  const resetLocal = () => {
    setTokens(serverDesign.tokens)
    setMarkdown(serverDesign.markdown)
    setHexDrafts({})
    toast.info('Reverted to the last saved design')
  }

  return (
    <Tabs defaultValue="preview" className="gap-4">
      <TabsList className="h-auto w-full flex-wrap sm:w-auto">
        <TabsTrigger value="preview">
          <Eye className="size-3.5" />
          Live preview
        </TabsTrigger>
        <TabsTrigger value="editor">
          <SlidersHorizontal className="size-3.5" />
          Visual editor
        </TabsTrigger>
        <TabsTrigger value="markdown">
          <FileText className="size-3.5" />
          DESIGN.md
        </TabsTrigger>
      </TabsList>

      {/* ---------------- Live preview ---------------- */}
      <TabsContent value="preview" className="mt-2 space-y-3">
        {/* AI theme directions — switch themes live, apply the best outcome */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Theme directions</h3>
              <p className="text-xs text-muted-foreground">
                AI variants built from your approved research — switch live to compare, then apply one.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={themesLoading || saving || generating}
                >
                  {themesLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {themes.length === 0 ? 'Suggest themes' : 'Regenerate themes'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {themes.length === 0 ? 'Generate theme directions?' : 'Regenerate theme directions?'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    The AI will propose 3 alternative directions (colors, typography, shapes) grounded
                    in your approved research, with the best-matching one marked. Your current design
                    stays untouched until you apply a direction.
                    {themes.length > 0 && ' The previous suggestions will be replaced.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-primary text-primary-foreground hover:bg-ember-600"
                    onClick={handleGenerateThemes}
                  >
                    Generate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {themesLoading ? (
            <div className="flex flex-wrap items-center gap-2">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-7 animate-pulse rounded-full bg-muted"
                  style={{ width: `${96 + i * 26}px` }}
                />
              ))}
              <span className="text-xs text-muted-foreground">Generating research-grounded directions…</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={previewPill(activeThemeId === 'original')}
                onClick={() => setActiveThemeId('original')}
                aria-pressed={activeThemeId === 'original'}
              >
                Applied design
              </button>
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={previewPill(activeThemeId === t.id)}
                  onClick={() => setActiveThemeId(t.id)}
                  aria-pressed={activeThemeId === t.id}
                >
                  {t.id === bestThemeId && <Sparkles className="size-3 text-ember-500" />}
                  {t.name}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {t.score}
                  </span>
                </button>
              ))}
            </div>
          )}

          {themes.length === 0 && !themesLoading && (
            <p className="mt-2 text-xs text-muted-foreground">
              No suggestions yet — generate to get 3 research-backed directions with the best outcome marked.
            </p>
          )}

          {activeTheme && (
            <div className="mt-3 rounded-md border border-ember-200 bg-ember-50/60 p-3 dark:border-ember-500/30 dark:bg-ember-500/5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ember-800 dark:text-ember-300">
                      {activeTheme.name}
                    </span>
                    {activeTheme.id === bestThemeId && (
                      <Badge className="border-ember-200 bg-ember-100 text-ember-800 dark:border-ember-500/40 dark:bg-ember-500/15 dark:text-ember-300">
                        <Sparkles className="size-3" />
                        Best match
                      </Badge>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{activeTheme.score}/100</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{activeTheme.reason}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => applyTheme(activeTheme)}
                    disabled={applyingTheme || saving}
                    className="bg-primary text-primary-foreground hover:bg-ember-600"
                  >
                    {applyingTheme ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    Apply to design
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveThemeId('original')}
                    disabled={applyingTheme}
                  >
                    Back to applied
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <LivePreview tokens={previewTokens} />
      </TabsContent>

      {/* ---------------- Visual editor ---------------- */}
      <TabsContent value="editor" className="mt-2">
        <div className="max-h-[720px] space-y-5 overflow-y-auto df-scroll pr-1">
          {/* Brand */}
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-50">Brand</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="brand-name">Brand name</Label>
                <Input
                  id="brand-name"
                  value={tokens.brand?.name ?? ''}
                  onChange={(e) =>
                    setTokens((t) =>
                      t
                        ? {
                            ...t,
                            brand: { ...t.brand, name: e.target.value, personality: t.brand?.personality ?? [] },
                          }
                        : t
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-voice">Brand voice</Label>
                <Textarea
                  id="brand-voice"
                  value={tokens.brand?.voice ?? ''}
                  onChange={(e) =>
                    setTokens((t) =>
                      t
                        ? {
                            ...t,
                            brand: { ...t.brand, voice: e.target.value, personality: t.brand?.personality ?? [] },
                          }
                        : t
                    )
                  }
                  rows={2}
                />
              </div>
              {(tokens.brand?.personality ?? []).length > 0 && (
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">
                    Personality (read-only)
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {tokens.brand.personality.map((trait) => (
                      <Badge
                        key={trait}
                        variant="outline"
                        className="border-ember-200 bg-ember-50 text-ember-700 dark:border-ember-500/30 dark:bg-ember-500/10 dark:text-ember-400"
                      >
                        {trait}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Colors */}
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-50">Colors</h3>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {COLOR_ROLES.map((role) => {
                const draft = hexDrafts[role] ?? tokens.colors?.[role]?.hex ?? ''
                return (
                  <div key={role} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Label className="text-xs font-medium">{roleLabel(role)}</Label>
                      <p className="truncate text-xs text-muted-foreground">
                        {tokens.colors?.[role]?.usage ?? '—'}
                      </p>
                    </div>
                    <input
                      type="color"
                      value={roleHex(role)}
                      aria-label={`${roleLabel(role)} color picker`}
                      onChange={(e) => patchColor(role, e.target.value)}
                      className="size-8 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                    />
                    <Input
                      value={draft}
                      aria-label={`${roleLabel(role)} hex value`}
                      onChange={(e) => {
                        const v = e.target.value
                        setHexDrafts((d) => ({ ...d, [role]: v }))
                        if (isHex(v)) patchColor(role, v)
                      }}
                      onBlur={() =>
                        setHexDrafts((d) => {
                          const next = { ...d }
                          delete next[role]
                          return next
                        })
                      }
                      className="w-28 shrink-0 font-mono text-xs"
                      maxLength={7}
                      placeholder="#000000"
                    />
                  </div>
                )
              })}
            </div>
          </section>

          {/* Typography */}
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-50">Typography</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="font-heading">Heading family</Label>
                <Select
                  value={tokens.typography?.heading?.family ?? 'Inter'}
                  onValueChange={(v) =>
                    setTokens((t) =>
                      t
                        ? {
                            ...t,
                            typography: {
                              ...t.typography,
                              heading: {
                                family: v,
                                weights: t.typography?.heading?.weights ?? [700, 800],
                                letterSpacing: t.typography?.heading?.letterSpacing ?? '-0.02em',
                              },
                            },
                          }
                        : t
                    )
                  }
                >
                  <SelectTrigger id="font-heading" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 df-scroll">
                    {familyOptions(tokens.typography?.heading?.family ?? 'Inter').map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="font-body">Body family</Label>
                <Select
                  value={tokens.typography?.body?.family ?? 'Inter'}
                  onValueChange={(v) =>
                    setTokens((t) =>
                      t
                        ? {
                            ...t,
                            typography: {
                              ...t.typography,
                              body: {
                                family: v,
                                weights: t.typography?.body?.weights ?? [400, 500, 600],
                                lineHeight: t.typography?.body?.lineHeight ?? '1.6',
                              },
                            },
                          }
                        : t
                    )
                  }
                >
                  <SelectTrigger id="font-body" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 df-scroll">
                    {familyOptions(tokens.typography?.body?.family ?? 'Inter').map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Radius */}
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-50">Corner radius</h3>
            <div className="space-y-4">
              {(['sm', 'md', 'lg'] as const).map((key) => {
                const px = parsePx(tokens.radius?.[key], key === 'sm' ? 6 : key === 'md' ? 10 : 16)
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Radius {key}
                      </Label>
                      <span className="font-mono text-xs text-gray-500">{px}px</span>
                    </div>
                    <Slider
                      min={0}
                      max={24}
                      step={1}
                      value={[px]}
                      onValueChange={(v) => patchRadius(key, v[0] ?? px)}
                      aria-label={`Corner radius ${key}`}
                    />
                  </div>
                )
              })}
            </div>
          </section>

          {/* Shadows */}
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-50">Shadows</h3>
            <div className="space-y-1.5">
              <Label htmlFor="shadow-preset">Shadow preset (applies to all elevations)</Label>
              <Select value={currentShadowPreset} onValueChange={applyShadowPreset}>
                <SelectTrigger id="shadow-preset" className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(SHADOW_PRESETS).map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      <span className="capitalize">{preset}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Trust patterns */}
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-50">Trust patterns</h3>
            <div className="space-y-1.5">
              <Label htmlFor="trust-patterns">
                Trust-building patterns <span className="font-normal text-muted-foreground">(one per line)</span>
              </Label>
              <Textarea
                id="trust-patterns"
                value={(tokens.trustPatterns ?? []).join('\n')}
                onChange={(e) =>
                  setTokens((t) => (t ? { ...t, trustPatterns: e.target.value.split('\n') } : t))
                }
                rows={5}
                className="min-h-24"
              />
            </div>
          </section>
        </div>

        {/* Editor actions */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void onSaveTokens(tokens)}
            disabled={saving || generating}
            className="bg-primary text-primary-foreground hover:bg-ember-600"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save changes
          </Button>
          <Button variant="outline" onClick={resetLocal} disabled={saving || generating}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={saving || generating}>
                <RefreshCw className="size-4" />
                Regenerate with AI
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate the design system?</AlertDialogTitle>
                <AlertDialogDescription>
                  The AI will rebuild colors, typography, components and DESIGN.md from your logo
                  and audience research. Unsaved manual edits will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-primary text-primary-foreground hover:bg-ember-600"
                  onClick={() => void onRegenerate()}
                >
                  Regenerate
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TabsContent>

      {/* ---------------- DESIGN.md ---------------- */}
      <TabsContent value="markdown" className="mt-2">
        <div className="mb-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void copyToClipboard(markdown)
                .then(() => toast.success('DESIGN.md copied to clipboard'))
                .catch(() => toast.error('Could not copy to clipboard'))
            }
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
        </div>
        <Tabs defaultValue="rendered">
          <TabsList>
            <TabsTrigger value="rendered">Rendered</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
          </TabsList>
          <TabsContent value="rendered" className="mt-3">
            <div className="df-md max-h-[720px] overflow-y-auto df-scroll rounded-lg border border-border bg-card p-6 shadow-sm">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
          </TabsContent>
          <TabsContent value="source" className="mt-3 space-y-3">
            <Textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              aria-label="DESIGN.md markdown source"
              className="df-scroll min-h-[560px] font-mono text-xs leading-relaxed"
            />
            <div className="flex justify-end">
              <Button
                onClick={() => void onSaveMarkdown(markdown)}
                disabled={saving || generating || markdown === serverDesign.markdown}
                className="bg-primary text-primary-foreground hover:bg-ember-600"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save markdown
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  )
}

'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Palette, RotateCcw, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  ACCENT_OPTIONS,
  DENSITY_OPTIONS,
  RADIUS_OPTIONS,
  UI_STYLE_OPTIONS,
  resetAppearance,
  setAppearance,
  useAppearance,
} from '@/lib/client/appearance'
import type { UiStyle } from '@/lib/client/appearance'

/**
 * Static mini mock of each UI style preset - the tile always shows
 * the target look (not the current theme) so the picker previews
 * like a pro design-tool style switcher.
 */
function StyleMock({ style }: { style: UiStyle }) {
  const card = 'flex w-14 flex-col gap-1 p-2'
  if (style === 'glass') {
    return (
      <span className="flex h-14 w-full items-center justify-center rounded-md border border-border bg-[linear-gradient(135deg,#a5b4fc40,#e7e5e466,#67e8f940)]">
        <span className={cn(card, 'rounded-md border border-white/60 bg-white/55 backdrop-blur-sm')}>
          <span className="h-1.5 w-8 rounded-full bg-neutral-500/70" />
          <span className="h-3.5 w-full rounded-[3px] bg-neutral-700/80" />
        </span>
      </span>
    )
  }
  if (style === 'brutal') {
    return (
      <span className="flex h-14 w-full items-center justify-center rounded-md border border-border bg-muted/60">
        <span className={cn(card, 'rounded-[3px] border-2 border-neutral-900 bg-white shadow-[3px_3px_0_0_#18181b]')}>
          <span className="h-1.5 w-8 rounded-[1px] bg-neutral-900" />
          <span className="h-3.5 w-full rounded-[1px] bg-neutral-900" />
        </span>
      </span>
    )
  }
  if (style === 'soft') {
    return (
      <span className="flex h-14 w-full items-center justify-center rounded-md border border-border bg-muted/60">
        <span className={cn(card, 'rounded-xl border-0 bg-white shadow-[0_6px_16px_-6px_rgba(0,0,0,0.4)]')}>
          <span className="h-1.5 w-8 rounded-full bg-neutral-200" />
          <span className="h-3.5 w-full rounded-full bg-neutral-400" />
        </span>
      </span>
    )
  }
  // classic
  return (
    <span className="flex h-14 w-full items-center justify-center rounded-md border border-border bg-muted/60">
      <span className={cn(card, 'rounded-md border border-neutral-300 bg-white')}>
        <span className="h-1.5 w-8 rounded-full bg-neutral-300" />
        <span className="h-3.5 w-full rounded-[3px] bg-neutral-700" />
      </span>
    </span>
  )
}

/** Segmented control used by Mode / Radius / Density sections. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: readonly { value: T; label: string; icon?: typeof Sun }[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div
      className="grid gap-1 rounded-lg border border-border bg-muted/50 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(({ value: v, label, icon: Icon }) => {
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cn(
              'flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Whole-UI appearance switcher: UI style preset (restyles every
 * component at once), color mode, accent color, corner radius and
 * density. Grouped Style / Color / Layout like a design-tool
 * inspector; every choice retunes the shared CSS variable scales
 * in globals.css and persists across visits.
 */
export function AppearancePanel() {
  const appearance = useAppearance()

  // Same hydration gate the header uses for next-themes: the server
  // render cannot know the stored mode, so render an inert trigger
  // until after hydration.
  const emptySubscribe = () => () => {}
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  const { resolvedTheme, setTheme } = useTheme()
  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          aria-label="Appearance settings"
          title="Appearance settings"
        >
          <Palette className="size-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Appearance</p>
          <button
            type="button"
            onClick={() => {
              resetAppearance()
              setTheme('light')
            }}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        </div>

        <div className="space-y-4">
          {/* UI style preset - the whole-UI components toggle */}
          <section aria-label="UI style">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Style</p>
            <div className="grid grid-cols-2 gap-2">
              {UI_STYLE_OPTIONS.map(({ value, label }) => {
                const active = appearance.uiStyle === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${label} style`}
                    onClick={() => setAppearance({ uiStyle: value })}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-1.5 transition-colors',
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-ink-300 dark:hover:border-ink-500/60'
                    )}
                  >
                    <StyleMock style={value} />
                    <span
                      className={cn(
                        'text-xs font-medium',
                        active ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <Separator />

          {/* Color: mode + accent */}
          <section aria-label="Color" className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Mode</p>
              <Segmented
                options={[
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'dark', label: 'Dark', icon: Moon },
                ] as const}
                value={isDark ? 'dark' : 'light'}
                onChange={(v) => setTheme(v)}
                disabled={!mounted}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Accent</p>
              <div className="flex items-center gap-2">
                {ACCENT_OPTIONS.map(({ value, label, swatch }) => {
                  const active = appearance.accent === value
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${label} accent`}
                      title={label}
                      onClick={() => setAppearance({ accent: value })}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110',
                        active &&
                          'ring-2 ring-ring ring-offset-2 ring-offset-popover dark:ring-offset-popover'
                      )}
                    >
                      <span
                        className="block size-5 rounded-full border border-black/10"
                        style={{ backgroundColor: swatch }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <Separator />

          {/* Layout: radius + density */}
          <section aria-label="Layout" className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Corner radius</p>
              <Segmented
                options={RADIUS_OPTIONS}
                value={appearance.radius}
                onChange={(v) => setAppearance({ radius: v })}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Density</p>
              <Segmented
                options={DENSITY_OPTIONS}
                value={appearance.density}
                onChange={(v) => setAppearance({ density: v })}
              />
            </div>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  )
}

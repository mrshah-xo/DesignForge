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
import { cn } from '@/lib/utils'
import {
  ACCENT_OPTIONS,
  DENSITY_OPTIONS,
  RADIUS_OPTIONS,
  resetAppearance,
  setAppearance,
  useAppearance,
} from '@/lib/client/appearance'

/**
 * Whole-UI appearance switcher: color mode, accent color, corner
 * radius, and density. Every choice retunes the shared CSS variable
 * scales in globals.css, so the entire component library (buttons,
 * cards, inputs, dialogs, steppers...) changes together and the
 * preference persists across visits.
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

      <PopoverContent align="end" className="w-72 p-4">
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
          {/* Color mode */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Mode</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {(
                [
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'dark', label: 'Dark', icon: Moon },
                ] as const
              ).map(({ value, label, icon: Icon }) => {
                const active = isDark === (value === 'dark')
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!mounted}
                    aria-pressed={active}
                    onClick={() => setTheme(value)}
                    className={cn(
                      'flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Accent color */}
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

          {/* Corner radius */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Corner radius</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {RADIUS_OPTIONS.map(({ value, label }) => {
                const active = appearance.radius === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAppearance({ radius: value })}
                    className={cn(
                      'flex h-8 items-center justify-center rounded-md text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Density */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Density</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {DENSITY_OPTIONS.map(({ value, label }) => {
                const active = appearance.density === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAppearance({ density: value })}
                    className={cn(
                      'flex h-8 items-center justify-center rounded-md text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

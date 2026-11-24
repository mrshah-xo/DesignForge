'use client'

import { useSyncExternalStore } from 'react'
import Image from 'next/image'
import { Clock, ChevronDown, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AppearancePanel } from '@/components/wizard/appearance-panel'
import { LogoThumb } from '@/components/wizard/logo-thumb'
import { SecretsPanel } from '@/components/wizard/secrets-panel'
import { prettyStatus } from '@/components/wizard/status-badge'
import type { ProjectSummary } from '@/lib/types'

interface HeaderProps {
  projects: ProjectSummary[]
  loadingProjects: boolean
  onOpenProject: (id: string) => void
  onNewProject: () => void
  /** Wizard completion percentage (0-100); hidden while undefined. */
  progress?: number
}

export function Header({ projects, loadingProjects, onOpenProject, onNewProject, progress }: HeaderProps) {
  // Radix DropdownMenu generates useId() values that can differ between the
  // server and client render in dev, producing a hydration mismatch warning.
  // The dropdown is the only SSR-rendered Radix component, so we gate it on
  // mount: identical markup server-side (inert button), real menu after hydration.
  // useSyncExternalStore is the hydration-safe way to detect "client mounted"
  // without a setState-in-effect round trip.
  const emptySubscribe = () => () => {}
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  // The light/dark toggle lives inside the AppearancePanel together with
  // the accent, radius, and density controls - one pro appearance entry
  // point instead of scattered toggles.

  return (
    <header className="df-glass sticky top-0 z-40 border-b border-border/80">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Brand signature: black calligraphy in light mode, white in dark.
              Both renderings stay in the markup and are switched purely via
              CSS (dark:hidden / dark:block), so the server render and the
              hydration pass always agree - no mounted-gate needed. */}
          <span aria-hidden="true" className="flex shrink-0 items-center">
            <Image
              src="/mrdesign-logo-light.png"
              alt=""
              width={941}
              height={211}
              priority
              className="h-9 w-auto sm:h-10 dark:hidden"
            />
            <Image
              src="/mrdesign-logo-dark.png"
              alt=""
              width={2057}
              height={685}
              priority
              className="hidden h-9 w-auto sm:h-12 dark:block"
            />
          </span>
          <span className="sr-only">MrDesign.md</span>
        </div>

        <nav aria-label="Project actions" className="flex items-center gap-2">
          <SecretsPanel />

          <AppearancePanel />

          {/* Utility cluster | project cluster divider */}
          <div aria-hidden="true" className="h-5 w-px bg-border" />

          {mounted ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                title="Projects"
              >
                <Clock className="size-4 text-gray-400" />
                <span className="hidden sm:inline">Projects</span>
                <ChevronDown className="size-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs text-gray-500">
                Projects
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {loadingProjects ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : projects.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No projects yet.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto df-scroll">
                  {projects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onSelect={() => onOpenProject(p.id)}
                      className="cursor-pointer gap-2.5 py-2.5"
                    >
                      <LogoThumb src={p.logoDataUrl} name={p.name} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        {p.description && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.description}
                          </span>
                        )}
                      </span>
                      <Badge
                        variant="secondary"
                        className="shrink-0 border border-border bg-muted text-[10px] text-gray-500 dark:text-gray-400"
                      >
                        {prettyStatus(p.status)}
                      </Badge>
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              aria-label="Projects"
              title="Projects"
            >
              <Clock className="size-4 text-gray-400" />
              <span className="hidden sm:inline">Projects</span>
              <ChevronDown className="size-3.5 text-gray-400" />
            </Button>
          )}

          <Button
            size="sm"
            onClick={onNewProject}
            aria-label="New project"
            title="New project"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">New project</span>
          </Button>
        </nav>
      </div>

      {/* Wizard progress hairline - a quick "how far along am I" cue that
          sticks with the header while a project is open. */}
      {typeof progress === 'number' && (
        <div
          role="progressbar"
          aria-label="Wizard progress"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border/60"
        >
          <div
            className="h-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </header>
  )
}

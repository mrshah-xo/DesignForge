'use client'

import { useSyncExternalStore } from 'react'
import Image from 'next/image'
import { Clock, ChevronDown, Moon, Plus, Loader2, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
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
import { LogoThumb } from '@/components/wizard/logo-thumb'
import { SecretsPanel } from '@/components/wizard/secrets-panel'
import { prettyStatus } from '@/components/wizard/status-badge'
import type { ProjectSummary } from '@/lib/types'

interface HeaderProps {
  projects: ProjectSummary[]
  loadingProjects: boolean
  onOpenProject: (id: string) => void
  onNewProject: () => void
}

export function Header({ projects, loadingProjects, onOpenProject, onNewProject }: HeaderProps) {
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

  // Light/Dark toggle for the MrDesign.md UI itself. The icon is gated on
  // `mounted` so the server render (and the hydration pass) always agree.
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = mounted && resolvedTheme === 'dark'
  const themeLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode'

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

          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={themeLabel}
            title={themeLabel}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {mounted ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                title="Recent projects"
              >
                <Clock className="size-4 text-gray-400" />
                <span className="hidden sm:inline">Recent projects</span>
                <ChevronDown className="size-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs text-gray-500">
                Recent projects
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {loadingProjects ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : projects.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No projects yet - upload a logo to start.
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
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.description || 'No description'}
                        </span>
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
              aria-label="Recent projects"
              title="Recent projects"
            >
              <Clock className="size-4 text-gray-400" />
              <span className="hidden sm:inline">Recent projects</span>
              <ChevronDown className="size-3.5 text-gray-400" />
            </Button>
          )}

          <Button
            size="sm"
            onClick={onNewProject}
            aria-label="New project"
            title="New project"
            className="bg-primary text-primary-foreground hover:bg-ink-600"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">New project</span>
          </Button>
        </nav>
      </div>
    </header>
  )
}

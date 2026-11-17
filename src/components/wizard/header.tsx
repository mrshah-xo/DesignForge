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
import { LogoThumb } from '@/components/wizard/logo-thumb'
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

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-background/80 backdrop-blur dark:border-zinc-800">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-11 shrink-0 items-center rounded-xl bg-white px-2.5 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700"
          >
            <Image
              src="/dfl-logo.png"
              alt=""
              width={980}
              height={475}
              priority
              className="h-8 w-auto"
            />
          </span>
          <span className="sr-only">DesignForge</span>
          <Badge
            variant="outline"
            className="hidden shrink-0 border-zinc-200 bg-zinc-50 text-zinc-500 sm:inline-flex dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
          >
            Logo → DESIGN.md
          </Badge>
        </div>

        <nav aria-label="Project actions" className="flex items-center gap-2">
          {mounted ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Clock className="size-4 text-zinc-400" />
                <span className="hidden sm:inline">Recent projects</span>
                <span className="sm:hidden">Recent</span>
                <ChevronDown className="size-3.5 text-zinc-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs text-zinc-500">
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
                  No projects yet — upload a logo to start.
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
                        className="shrink-0 border border-zinc-200 bg-zinc-50 text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
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
            <Button variant="outline" size="sm" className="gap-1.5" aria-label="Recent projects">
              <Clock className="size-4 text-zinc-400" />
              <span className="hidden sm:inline">Recent projects</span>
              <span className="sm:hidden">Recent</span>
              <ChevronDown className="size-3.5 text-zinc-400" />
            </Button>
          )}

          <Button
            size="sm"
            onClick={onNewProject}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="size-4" />
            New project
          </Button>
        </nav>
      </div>
    </header>
  )
}

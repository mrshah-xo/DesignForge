'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Copy,
  Download,
  FileJson,
  FileText,
  Image as ImageIcon,
  Loader2,
  Package,
  PackageCheck,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, copyToClipboard, downloadText } from '@/lib/client/api'
import { TRUST_LEVELS } from '@/lib/types'
import type { ProjectDetail } from '@/lib/types'

interface ExportStepProps {
  project: ProjectDetail
  onStartNew: () => void
}

type BusyKind = null | 'zip' | 'md' | 'tokens' | 'metadata' | 'copy'
type FileKind = 'md' | 'tokens' | 'metadata'

const PACKAGE_CONTENTS = [
  {
    icon: FileText,
    name: 'DESIGN.md',
    detail: 'Agent-ready brand spec',
  },
  {
    icon: FileJson,
    name: 'tokens.json',
    detail: 'Structured design tokens',
  },
  {
    icon: FileJson,
    name: 'metadata.json',
    detail: 'Audience, research, score',
  },
  {
    icon: ImageIcon,
    name: 'logo file',
    detail: 'Your original logo',
  },
  {
    icon: ImageIcon,
    name: 'brand-sheet.svg',
    detail: 'Palette + type samples',
  },
]

const AGENT_TIP = 'Paste DESIGN.md into Cursor, v0 or Claude Code - tokens.json imports into Tailwind.'

function trustLabel(value: string): string {
  return TRUST_LEVELS.find((t) => t.value === value)?.label ?? value
}

export function ExportStep({ project, onStartNew }: ExportStepProps) {
  const [busy, setBusy] = useState<BusyKind>(null)

  const design = project.design
  const audience = project.audience
  const palette = project.analysis?.palette ?? []
  const score = design ? Math.round(design.matchScore) : null
  const scoreTone =
    score !== null && score >= 75
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
      : score !== null && score >= 50
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'

  const run = async (kind: Exclude<BusyKind, null>, fn: () => Promise<void>) => {
    setBusy(kind)
    try {
      await fn()
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setBusy(null)
    }
  }

  const downloadPart = (kind: FileKind) =>
    run(kind, async () => {
      const data = await api.fetchExportJson(project.id)
      if (kind === 'md') {
        downloadText('DESIGN.md', data.design_md, 'text/markdown')
      } else if (kind === 'tokens') {
        downloadText('tokens.json', JSON.stringify(data.tokens, null, 2), 'application/json')
      } else {
        downloadText('metadata.json', JSON.stringify(data.metadata, null, 2), 'application/json')
      }
    })

  return (
    <div className="space-y-6">
      {/* Summary */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-ink-50 text-ink-600 dark:bg-ink-500/10 dark:text-ink-300">
            <PackageCheck className="size-4.5" />
          </span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            Your brand package is ready
          </h2>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {score !== null && (
            <Badge variant="outline" className={scoreTone}>
              Logo fit {score}/100
            </Badge>
          )}
          {audience && (
            <>
              <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                {audience.categoryLabel}
              </Badge>
              <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                Trust need: {trustLabel(audience.trustNeed).split(' - ')[0]}
              </Badge>
            </>
          )}
        </div>

        {palette.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Palette</p>
            <div className="flex overflow-hidden rounded-lg border border-border">
              {palette.slice(0, 5).map((c) => (
                <div
                  key={`${c.hex}-${c.name}`}
                  title={`${c.name} ${c.hex}`}
                  className="h-9 flex-1"
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>
        )}
      </motion.section>

      {/* Package contents */}
      <section
        aria-labelledby="contents-heading"
        className="rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <h2 id="contents-heading" className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-50">
          <Package className="size-4 text-gray-400" />
          Package contents
        </h2>
        <ul className="space-y-3">
          {PACKAGE_CONTENTS.map(({ icon: Icon, name, detail }) => (
            <li key={name} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-gray-500">
                <Icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{name}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Actions */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Button
          onClick={() => void run('zip', () => api.downloadZip(project.id, project.name))}
          disabled={busy !== null}
          className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
        >
          {busy === 'zip' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Download full package (.zip)
        </Button>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ['md', 'DESIGN.md'],
              ['tokens', 'tokens.json'],
              ['metadata', 'metadata.json'],
            ] as const
          ).map(([kind, label]) => (
            <Button key={kind} variant="outline" size="sm" disabled={busy !== null} onClick={() => void downloadPart(kind)}>
              {busy === kind ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              void run('copy', async () => {
                const data = await api.fetchExportJson(project.id)
                await copyToClipboard(data.design_md)
                toast.success('DESIGN.md copied to clipboard')
              })
            }
          >
            {busy === 'copy' ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
            Copy DESIGN.md
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">{AGENT_TIP}</p>
      </section>

      <div className="flex justify-center pb-2">
        <Button
          onClick={onStartNew}
          variant="outline"
          className="border-ink-600 text-ink-700 hover:bg-ink-50 hover:text-ink-800 dark:border-ink-500 dark:text-ink-300 dark:hover:bg-ink-500/10"
        >
          <Plus className="size-4" />
          Start a new project
        </Button>
      </div>
    </div>
  )
}

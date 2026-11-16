'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LogoDropzone } from '@/components/steps/logo-dropzone'
import { StatusBadge } from '@/components/wizard/status-badge'
import type { ProjectDetail } from '@/lib/types'

interface UploadStepProps {
  project: ProjectDetail
  busy: boolean
  onReplace: (file: File, name: string, description: string) => Promise<void>
}

/**
 * Step 1 (reachable only when a project exists): review the current logo
 * and optionally replace it — which restarts the whole pipeline.
 */
export function UploadStep({ project, busy, onReplace }: UploadStepProps) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)

  const canSubmit = !!file && name.trim().length > 0 && !busy

  return (
    <div className="space-y-6">
      <section aria-labelledby="current-logo">
        <h2 id="current-logo" className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Current logo
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          This is the logo your project is built around.
        </p>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center"
        >
          <img
            src={project.logoDataUrl}
            alt={`${project.name} logo`}
            className="size-40 shrink-0 self-center rounded-2xl border border-zinc-100 bg-[repeating-conic-gradient(#fafafa_0%_25%,#f4f4f5_0%_50%)] bg-[length:16px_16px] object-contain p-2 dark:border-zinc-800 sm:self-start"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{project.name}</h3>
              <StatusBadge status={project.status} />
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
            <p className="text-xs text-zinc-400">
              Uploaded {new Date(project.createdAt).toLocaleString()}
            </p>
          </div>
        </motion.div>
      </section>

      <section aria-labelledby="replace-logo">
        <h2 id="replace-logo" className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Replace logo
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Upload a different logo to start a fresh run of the wizard.
        </p>

        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <p>
              Re-uploading re-runs AI analysis and invalidates any research, fit report and design
              system generated for this project.
            </p>
          </div>

          <LogoDropzone file={file} onFile={setFile} compact disabled={busy} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="replace-name">Project name</Label>
              <Input
                id="replace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replace-desc">Description</Label>
              <Textarea
                id="replace-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={280}
                className="min-h-9"
              />
            </div>
          </div>

          <Button
            onClick={() => {
              if (!file) return
              void onReplace(file, name.trim(), description.trim())
            }}
            disabled={!canSubmit}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Replacing…
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                Replace & re-analyze
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  )
}

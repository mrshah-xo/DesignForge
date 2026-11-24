'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, ScanSearch, BookOpenCheck, GitCompareArrows, PackageCheck, Loader2, Wand2, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LogoDropzone } from '@/components/steps/logo-dropzone'
import { DesignGenerating } from '@/components/wizard/design-generating'
import { StepIcon } from '@/components/wizard/step-icon'
import { BriefDialog } from '@/components/wizard/brief-dialog'
import { ANALYSIS_MESSAGES } from '@/components/wizard/progress-messages'
import { STEPS } from '@/lib/types'
import type { AudienceData } from '@/lib/types'
import { audiencePrefillFromBrief, type ParsedBrief } from '@/lib/brief'

const FEATURE_CHIPS = [
  { icon: ScanSearch, label: 'VLM logo analysis' },
  { icon: BookOpenCheck, label: 'Audience research you approve' },
  { icon: GitCompareArrows, label: 'Logo fit audit' },
  { icon: PackageCheck, label: 'DESIGN.md + tokens + assets' },
]

interface LandingProps {
  analyzing: boolean
  onStart: (file: File, name: string, description: string) => Promise<void>
  /** Audience fields parsed from an agent brief, held by the shell for step 3. */
  onAudiencePrefill: (audience: Partial<AudienceData>) => void
  audiencePrefilled: boolean
}

export function Landing({ analyzing, onStart, onAudiencePrefill, audiencePrefilled }: LandingProps) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)

  const canSubmit = !!file && name.trim().length > 0

  const handleSubmit = async () => {
    if (!file || !canSubmit) return
    setSubmitting(true)
    try {
      await onStart(file, name.trim(), description.trim())
      // Keep the form values so a failed analysis can be retried quickly.
    } finally {
      setSubmitting(false)
    }
  }

  const handleBriefApplied = (brief: ParsedBrief) => {
    if (brief.name) setName(brief.name)
    if (brief.description) setDescription(brief.description)
    const audience = audiencePrefillFromBrief(brief)
    if (audience) onAudiencePrefill(audience)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      {/* Hero - the single allowed flourish: neutral mesh wash under a glass pane */}
      <section className="df-mesh df-glass rounded-lg border border-border/80 px-6 py-10 text-center shadow-sm sm:px-10 sm:py-14">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-auto flex max-w-2xl flex-col items-center gap-4"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-ink-50 px-3 py-1 text-xs font-medium text-ink-700 dark:border-ink-500/30 dark:bg-ink-500/10 dark:text-ink-300">
            <Sparkles className="size-3.5" />
            7 steps · AI-powered
          </span>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl lg:text-5xl">
            Design Without Compromise
          </h1>
          <p className="text-pretty text-sm text-muted-foreground sm:text-base">
            Upload a logo - get an agent-ready DESIGN.md, design tokens, a live
            component preview, and a trust-focused fit report.
          </p>
        </motion.div>

        {/* Upload card / progress */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="mx-auto mt-8 max-w-xl"
        >
          {analyzing ? (
            <div className="rounded-lg border border-border bg-card shadow-sm">
              <DesignGenerating messages={ANALYSIS_MESSAGES} subtext="Our vision model is reading your logo - this can take up to 40 seconds." />
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 text-left shadow-sm">
              <LogoDropzone file={file} onFile={setFile} />
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input
                    id="project-name"
                    placeholder="e.g. PayFlow - payments for freelancers"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="project-desc">
                    What is it? <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="project-desc"
                    placeholder="One or two sentences about the product or company…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    maxLength={280}
                  />
                </div>
                {/* Venom pill CTA with the animated RGB glow - selected
                    component only, never the whole page (DESIGN.md). */}
                <div className="df-rgb-glow w-full rounded-full">
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitting}
                    className="df-btn-venom h-10 w-full rounded-full text-sm font-bold"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Creating project…
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" />
                        Start Designing
                      </>
                    )}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBriefOpen(true)}
                  className="w-full border-dashed"
                >
                  <Wand2 className="size-4" />
                  Want a prompt? Let an AI assistant fill this
                </Button>
                {audiencePrefilled && (
                  <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">
                    <CircleCheck className="size-3.5" />
                    Agent brief applied - after your logo is analyzed we jump straight to Research review (step 4).
                  </p>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {/* Feature chips */}
        <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-2">
          {FEATURE_CHIPS.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300"
            >
              <Icon className="size-3.5 text-ink-600 dark:text-ink-300" />
              {label}
            </span>
          ))}
        </div>
      </section>

      <BriefDialog
        open={briefOpen}
        onOpenChange={setBriefOpen}
        onApply={handleBriefApplied}
      />

      {/* How it works */}
      <section className="mt-10" aria-labelledby="how-it-works">
        <h2
          id="how-it-works"
          className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
        >
          How it works
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.03 * i }}
              whileHover={{ y: -2 }}
              className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center shadow-sm"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-ink-50 text-ink-600 dark:bg-ink-500/10 dark:text-ink-300">
                <StepIcon icon={step.icon} className="size-4" />
              </span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{step.label}</span>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  )
}

'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Copy, Layers2, ScanSearch, ShieldCheck, Smile, Sun, Wallpaper } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DesignGenerating } from '@/components/wizard/design-generating'
import { ANALYSIS_MESSAGES } from '@/components/wizard/progress-messages'
import { copyToClipboard } from '@/lib/client/api'
import type { AnalysisData, BackgroundSuggestion, ProjectDetail } from '@/lib/types'

interface AnalysisStepProps {
  project: ProjectDetail
  analyzing: boolean
  onRunAnalysis: () => Promise<void>
  onContinue: () => void
}

function WeightBar({ weight, max }: { weight: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((weight / max) * 100)) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <motion.div
        className="h-full rounded-full bg-gray-900 dark:bg-gray-300"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  )
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">{value || '—'}</p>
    </div>
  )
}

/** Showcases the recommended page backdrop derived from the logo. */
function BackgroundCard({ background }: { background: BackgroundSuggestion }) {
  const isGradient = background.mode === 'gradient' && background.to !== background.from
  const css = isGradient
    ? { backgroundImage: `linear-gradient(165deg, ${background.from} 0%, ${background.to} 100%)` }
    : { backgroundColor: background.from }
  const copyHex = (hex: string, label: string) => {
    void copyToClipboard(hex)
      .then(() => toast.success(`Copied ${hex}`, { description: label }))
      .catch(() => toast.error('Could not copy to clipboard'))
  }
  return (
    <section aria-labelledby="bg-heading">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="bg-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-50">
          Suggested page background
        </h2>
        <span className="text-xs text-muted-foreground">auto-applied when your design is generated</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div
          className="flex h-28 items-end justify-between p-4"
          style={css}
          role="img"
          aria-label={`${background.tone} ${background.mode} page background preview: ${background.from}${isGradient ? ` to ${background.to}` : ''}`}
        >
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
              background.tone === 'light' ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/80'
            }`}
          >
            {background.tone} canvas · {background.mode}
          </span>
          <span className="flex gap-1.5">
            {([background.from, isGradient ? background.to : null] as const)
              .filter((hex): hex is string => Boolean(hex))
              .map((hex, i) => (
                <button
                  key={`${hex}-${i}`}
                  type="button"
                  onClick={() => copyHex(hex, i === 0 ? 'Surface start' : 'Surface end')}
                  className="rounded-md bg-black/10 px-2 py-1 font-mono text-[10px] text-black/70 backdrop-blur-sm transition-colors hover:bg-black/20 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20"
                  aria-label={`Copy ${hex}`}
                >
                  <Copy className="mr-1 inline size-3" aria-hidden />
                  {hex}
                </button>
              ))}
          </span>
        </div>
        <div className="flex items-start gap-2.5 p-4">
          {isGradient ? (
            <Layers2 className="mt-0.5 size-4 shrink-0 text-ember-600 dark:text-ember-400" aria-hidden />
          ) : (
            <Wallpaper className="mt-0.5 size-4 shrink-0 text-ember-600 dark:text-ember-400" aria-hidden />
          )}
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{background.reason}</p>
        </div>
      </div>
    </section>
  )
}

export function AnalysisStep({ project, analyzing, onRunAnalysis, onContinue }: AnalysisStepProps) {
  // ---------------- No analysis yet ----------------
  if (!project.analysis) {
    if (analyzing) {
      return (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <DesignGenerating messages={ANALYSIS_MESSAGES} subtext="Our vision model is reading your logo — this can take up to 40 seconds." />
        </div>
      )
    }
    return (
      <section className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-ember-50 text-ember-600 dark:bg-ember-500/10 dark:text-ember-400">
          <ScanSearch className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-50">Run AI analysis</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Our vision model will extract your logo&apos;s palette, style, mood, industry signals and
          trust cues. This takes up to 40 seconds.
        </p>
        <Button
          onClick={() => void onRunAnalysis()}
          className="mt-6 bg-primary text-primary-foreground hover:bg-ember-600"
        >
          <ScanSearch className="size-4" />
          Run AI analysis
        </Button>
      </section>
    )
  }

  // ---------------- Analysis ready ----------------
  const analysis: AnalysisData = project.analysis
  const maxWeight = Math.max(...analysis.palette.map((c) => c.weight), 1)

  return (
    <div className="space-y-6">
      {/* Palette */}
      <section aria-labelledby="palette-heading">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="palette-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            Color signature
          </h2>
          <span className="text-xs text-muted-foreground">Click a hex to copy</span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {analysis.palette.map((color, i) => (
            <motion.button
              key={`${color.hex}-${color.name}`}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.04 * i }}
              whileHover={{ y: -2 }}
              onClick={() => {
                void copyToClipboard(color.hex)
                  .then(() => toast.success(`Copied ${color.hex}`, { description: color.name }))
                  .catch(() => toast.error('Could not copy to clipboard'))
              }}
              className="overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-md"
              aria-label={`Copy ${color.hex} (${color.name})`}
            >
              <div className="h-16 w-full" style={{ backgroundColor: color.hex }} />
              <div className="space-y-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
                    {color.name}
                  </span>
                  <code className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {color.hex}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <WeightBar weight={color.weight} max={maxWeight} />
                  <span className="w-9 shrink-0 text-right text-[10px] text-gray-400">
                    {Math.round(color.weight)}%
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Suggested page background (derived from the logo) */}
      {analysis.background && <BackgroundCard background={analysis.background} />}

      {/* Style tags */}
      {analysis.styleTags.length > 0 && (
        <section aria-labelledby="style-heading">
          <h2 id="style-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-50">
            Style tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {analysis.styleTags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="border-ember-200 bg-ember-50 text-ember-700 dark:border-ember-500/30 dark:bg-ember-500/10 dark:text-ember-400"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Mood / temperature / industry / audience guess */}
      <section className="grid gap-4 sm:grid-cols-2">
        <InfoCard
          icon={<Smile className="size-3.5 text-ember-600 dark:text-ember-400" />}
          label="Mood"
          value={analysis.mood}
        />
        <InfoCard
          icon={<Sun className="size-3.5 text-ember-600 dark:text-ember-400" />}
          label="Temperature"
          value={analysis.temperature}
        />
        <InfoCard
          icon={<ScanSearch className="size-3.5 text-ember-600 dark:text-ember-400" />}
          label="Industry guess"
          value={analysis.industry}
        />
        <InfoCard
          icon={<ShieldCheck className="size-3.5 text-ember-600 dark:text-ember-400" />}
          label="Audience guess"
          value={analysis.audienceGuess}
        />
      </section>

      {/* Trust signals */}
      {analysis.trustSignals.length > 0 && (
        <section aria-labelledby="trust-heading">
          <h2 id="trust-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-50">
            Trust signals
          </h2>
          <ul className="space-y-2">
            {analysis.trustSignals.map((signal) => (
              <li
                key={signal}
                className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm text-gray-700 shadow-sm dark:text-gray-300"
              >
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ember-600 dark:text-ember-400" />
                {signal}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Description */}
      <section aria-labelledby="desc-heading">
        <h2 id="desc-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-50">
          What we see
        </h2>
        <p className="rounded-lg border border-border bg-card p-5 text-sm leading-relaxed text-gray-700 shadow-sm dark:text-gray-300">
          {analysis.description}
        </p>
      </section>

      <div className="flex justify-end">
        <Button
          onClick={onContinue}
          className="bg-primary text-primary-foreground hover:bg-ember-600"
        >
          Continue → Who will use it
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

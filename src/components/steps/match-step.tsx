'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { DesignData } from '@/lib/types'

interface MatchStepProps {
  design: DesignData
  onContinue: () => void
}

const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function scoreColor(score: number): { stroke: string; text: string; label: string } {
  if (score >= 75) return { stroke: '#10B981', text: 'text-emerald-600 dark:text-emerald-400', label: 'Strong fit' }
  if (score >= 50) return { stroke: '#d97706', text: 'text-amber-600 dark:text-amber-400', label: 'Workable fit' }
  return { stroke: '#dc2626', text: 'text-red-600 dark:text-red-400', label: 'Needs attention' }
}

const SEVERITY_STYLES: Record<string, string> = {
  high: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400',
  medium: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400',
  low: 'border-border bg-muted text-muted-foreground',
}

export function MatchStep({ design, onContinue }: MatchStepProps) {
  const feedback = design.logoFeedback
  const score = Math.max(0, Math.min(100, Math.round(design.matchScore)))
  const color = scoreColor(score)
  const issues = feedback?.issues ?? []
  const suggestions = feedback?.suggestions ?? []

  return (
    <div className="space-y-6">
      {/* Score gauge */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
          <div className="relative size-44 shrink-0" role="img" aria-label={`Logo fit score ${score} out of 100`}>
            <svg viewBox="0 0 128 128" className="size-full -rotate-90">
              <circle
                cx="64"
                cy="64"
                r={RADIUS}
                fill="none"
                strokeWidth="12"
                className="stroke-gray-100 dark:stroke-gray-800"
              />
              <motion.circle
                cx="64"
                cy="64"
                r={RADIUS}
                fill="none"
                stroke={color.stroke}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                initial={{ strokeDashoffset: CIRCUMFERENCE }}
                animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - score / 100) }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-4xl font-bold tabular-nums ${color.text}`}>{score}</span>
              <span className="text-xs text-muted-foreground">/ 100 · {color.label}</span>
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Logo fit report</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {feedback?.verdict ?? 'No verdict available.'}
            </p>
          </div>
        </div>
      </section>

      {/* Issues */}
      {issues.length > 0 && (
        <section aria-labelledby="issues-heading">
          <h2 id="issues-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-50">
            Issues to know about
          </h2>
          <ul className="space-y-3">
            {issues.map((issue, i) => (
              <motion.li
                key={`${issue.title}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.04 * i }}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{issue.title}</span>
                    <Badge
                      variant="outline"
                      className={SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.low}
                    >
                      {issue.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{issue.detail}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <section aria-labelledby="suggestions-heading">
          <h2 id="suggestions-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-50">
            Suggestions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {suggestions.map((s, i) => (
              <motion.div
                key={`${s.title}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.04 * i }}
                className="rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-ink-50 text-ink-600 dark:bg-ink-500/10 dark:text-ink-300">
                    <Lightbulb className="size-3.5" />
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{s.title}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{s.detail}</p>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <p className="rounded-lg border border-border bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
        Suggestions are advisory - the generated palette already adapts your logo&apos;s DNA to this
        audience.
      </p>

      <div className="flex justify-end">
        <Button onClick={onContinue} className="bg-primary text-primary-foreground hover:bg-ink-600">
          Continue → Design system
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

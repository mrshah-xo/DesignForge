'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Human label for a raw server status string. */
export function prettyStatus(status: string): string {
  const map: Record<string, string> = {
    created: 'Uploaded',
    uploaded: 'Uploaded',
    analyzing: 'Analyzing',
    analyzed: 'Analyzed',
    audience: 'Audience set',
    audience_set: 'Audience set',
    researching: 'Researching',
    research: 'Research ready',
    needs_review: 'Needs review',
    approved: 'Approved',
    designing: 'Generating design',
    designed: 'Design ready',
    design: 'Design ready',
    exported: 'Exported',
  }
  if (map[status]) return map[status]
  return status
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

interface StatusBadgeProps {
  status: string
  label?: string
  className?: string
}

/**
 * Status pill. Research statuses get semantic tones:
 * needs_review -> amber, approved -> emerald, everything else zinc.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const text = label ?? prettyStatus(status)
  const tone =
    status === 'approved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
      : status === 'needs_review'
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
        : 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'

  return (
    <Badge variant="outline" className={cn('font-medium', tone, className)}>
      {text}
    </Badge>
  )
}

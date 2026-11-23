'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { LiveProgress } from '@/components/wizard/design-generating'

interface InlineProgressProps {
  /** Live server-side pipeline step (what the AI is doing right now). */
  live: LiveProgress | null
  /** Shown when no live step has arrived yet. */
  fallback: string
  /** Accessible label for the whole status region. */
  label?: string
}

const CHAR_MS = 16

/**
 * Reveals `text` character by character (ChatGPT typing style).
 * Remounted via `key={text}` by the parent, so state resets cleanly
 * on every new step without setState-in-effect.
 */
function Typewriter({ text }: { text: string }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          window.clearInterval(timer)
          return n
        }
        return n + 1
      })
    }, CHAR_MS)
    return () => window.clearInterval(timer)
  }, [text])

  const done = shown >= text.length
  return (
    <motion.span
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: 0.18 }}
      className="df-shimmer min-w-0 flex-1 truncate text-xs font-medium"
    >
      {text.slice(0, shown)}
      {!done && (
        <span
          className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse rounded-full bg-foreground/70"
          aria-hidden
        />
      )}
    </motion.span>
  )
}

/**
 * Compact ChatGPT-style status line for in-card jobs (e.g. theme
 * suggestions): the REAL pipeline step types itself out character by
 * character with a shimmer sweep + blinking caret, and finished steps
 * collapse into a muted checkmarked trail. Falls back to a static
 * shimmer label while the first poll is in flight.
 */
export function InlineProgress({ live, fallback, label }: InlineProgressProps) {
  const trail = live?.trail ?? []
  const current = live?.step ?? fallback
  const completed = trail.slice(0, -1).slice(-3)

  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-1.5"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? 'Generation progress'}
    >
      <div className="flex min-h-6 items-center gap-2">
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        <AnimatePresence mode="wait" initial={false}>
          <Typewriter key={current} text={current} />
        </AnimatePresence>
      </div>

      {completed.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5" aria-hidden="true">
          {completed.map((item) => (
            <motion.li
              key={item}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex max-w-full items-center gap-1 text-[11px] text-muted-foreground/70"
            >
              <CheckCircle2 className="size-2.5 shrink-0 text-emerald-500" />
              <span className="max-w-[240px] truncate">{item}</span>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}

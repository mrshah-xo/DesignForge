'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'

/** Live pipeline progress tracked client-side while a job polls. */
export interface LiveProgress {
  /** What the AI is doing right now (server job progress). */
  step: string | null
  /** Every distinct step seen so far — `step` is always the last entry. */
  trail: string[]
}

interface DesignGeneratingProps {
  /** Fallback rotation used when no live progress is available. */
  messages: string[]
  subtext?: string
  /** Live server-side progress; wins over the rotating messages. */
  live?: LiveProgress | null
}

const DEFAULT_SUBTEXT = 'This usually takes up to a minute — real research is running.'

/**
 * Full-step progress panel shown while long AI jobs run.
 * Shows the REAL pipeline step (searching, reading sources, writing…)
 * with a ChatGPT-style shimmer sweep, plus a muted trail of completed
 * steps. Falls back to rotating `messages` when no live progress is
 * available (e.g. polls landing on a different serverless instance).
 */
export function DesignGenerating({ messages, subtext = DEFAULT_SUBTEXT, live }: DesignGeneratingProps) {
  const liveStep = live?.step ?? null
  const trail = live?.trail ?? []

  // Fallback rotation — paused whenever live progress is available.
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (liveStep || messages.length <= 1) return
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % messages.length)
    }, 3500)
    return () => window.clearInterval(timer)
  }, [liveStep, messages.length])
  const fallbackMessage = messages[index] ?? messages[0] ?? 'Working…'

  const current = liveStep ?? fallbackMessage
  // Completed steps: everything before the current one (live mode only).
  const completed = liveStep ? trail.slice(0, -1) : []
  const visibleCompleted = completed.slice(-5)

  // Keep the trail's latest item in view as steps land.
  const trailRef = useRef<HTMLUListElement | null>(null)
  useEffect(() => {
    const el = trailRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [completed.length])

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-6 py-12 text-center"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Animated gradient ring spinner */}
      <div className="relative size-20" role="status" aria-label="Loading">
        <div
          className="absolute inset-0 animate-spin rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0%, #059669 75%, #34d399 100%)',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 5px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 5px))',
          }}
        />
        <div className="absolute inset-3 rounded-full border border-border" />
      </div>

      {/* Current step — ChatGPT-style shimmer sweep */}
      <div className="min-h-[3.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={current}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="df-shimmer text-base font-medium"
          >
            {current}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Completed steps trail — muted, checkmarked, like ChatGPT tool usage */}
      {visibleCompleted.length > 0 && (
        <ul
          ref={trailRef}
          aria-hidden="true"
          className="df-scroll max-h-28 w-full max-w-sm space-y-1 overflow-y-auto px-2 text-left"
        >
          <AnimatePresence initial={false}>
            {visibleCompleted.map((item) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                <span className="min-w-0 flex-1">{item}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Loading dots */}
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-ink-500"
            animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{subtext}</p>
    </motion.section>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface DesignGeneratingProps {
  messages: string[]
  subtext?: string
}

const DEFAULT_SUBTEXT = 'This usually takes up to a minute — real research is running.'

/**
 * Full-step progress panel shown while long AI jobs run.
 * Rotates `messages` every 3.5s with a soft crossfade.
 */
export function DesignGenerating({ messages, subtext = DEFAULT_SUBTEXT }: DesignGeneratingProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (messages.length <= 1) return
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % messages.length)
    }, 3500)
    return () => window.clearInterval(timer)
  }, [messages.length])

  const message = messages[index] ?? messages[0] ?? 'Working…'

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

      <div className="min-h-[3.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="text-base font-medium text-gray-900 dark:text-gray-50"
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Loading dots */}
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-ember-500"
            animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{subtext}</p>
    </motion.section>
  )
}

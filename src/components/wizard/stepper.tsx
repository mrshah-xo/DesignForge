'use client'

import { Check } from 'lucide-react'
import { STEPS } from '@/lib/types'
import { StepIcon } from '@/components/wizard/step-icon'
import { cn } from '@/lib/utils'

export type StepStatus = 'done' | 'current' | 'locked'

interface StepperProps {
  currentStep: number
  stepState: Record<number, StepStatus>
  onSelect: (id: number) => void
}

/**
 * Wizard navigation. Mobile: horizontal scrollable pill bar.
 * lg+: sticky vertical rail.
 */
export function Stepper({ currentStep, stepState, onSelect }: StepperProps) {
  const state = (id: number): StepStatus => stepState[id] ?? 'locked'
  const isDone = (id: number) => state(id) === 'done'
  const isCurrent = (id: number) => state(id) === 'current' || currentStep === id

  return (
    <nav aria-label="Wizard steps">
      {/* Mobile / tablet: scrollable pill bar */}
      <div className="flex gap-2 overflow-x-auto pb-1 df-scroll lg:hidden" role="tablist">
        {STEPS.map((step) => {
          const st = state(step.id)
          return (
            <button
              key={step.id}
              type="button"
              disabled={st === 'locked'}
              aria-current={isCurrent(step.id) ? 'step' : undefined}
              aria-disabled={st === 'locked'}
              onClick={() => onSelect(step.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                st === 'locked' && 'cursor-not-allowed border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-600',
                st !== 'locked' && isCurrent(step.id) &&
                  'border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400',
                st === 'done' && !isCurrent(step.id) &&
                  'border-zinc-200 bg-white text-zinc-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-500/50',
              )}
            >
              {st === 'done' && !isCurrent(step.id) ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="size-2.5" aria-hidden="true" />
                </span>
              ) : (
                <StepIcon icon={step.icon} className="size-3.5" />
              )}
              {step.label}
            </button>
          )
        })}
      </div>

      {/* lg+: vertical rail */}
      <ol className="hidden flex-col gap-1 lg:flex">
        {STEPS.map((step) => {
          const st = state(step.id)
          const current = isCurrent(step.id)
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={st === 'locked'}
                aria-current={current ? 'step' : undefined}
                onClick={() => onSelect(step.id)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                  st === 'locked' && 'cursor-not-allowed text-zinc-300 dark:text-zinc-600',
                  st !== 'locked' && current &&
                    'bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-600/60 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/60',
                  st === 'done' && !current &&
                    'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60',
                  st !== 'locked' && !current && st !== 'done' &&
                    'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border',
                    st === 'done' && 'border-emerald-600 bg-emerald-600 text-white',
                    st === 'current' && 'border-emerald-600 bg-white text-emerald-700 dark:bg-zinc-900 dark:text-emerald-400',
                    st === 'locked' && 'border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-600',
                    st !== 'locked' && st !== 'done' && st !== 'current' && 'border-zinc-300 text-zinc-500 dark:border-zinc-700',
                  )}
                >
                  {st === 'done' ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <StepIcon icon={step.icon} className="size-3.5" />
                  )}
                </span>
                <span className="flex-1">
                  <span className="block text-[10px] font-medium uppercase tracking-wider opacity-60">
                    Step {step.id}
                  </span>
                  {step.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

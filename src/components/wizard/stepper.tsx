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
                st === 'locked' && 'cursor-not-allowed border-border text-gray-300 dark:text-gray-600',
                st !== 'locked' && isCurrent(step.id) &&
                  'border-ink-600 bg-ink-50 text-ink-700 dark:border-ink-500 dark:bg-ink-500/10 dark:text-ink-300',
                st === 'done' && !isCurrent(step.id) &&
                  'border-border bg-card text-gray-700 hover:border-ink-300 hover:text-ink-700 dark:text-gray-300 dark:hover:border-ink-500/50',
              )}
            >
              {st === 'done' && !isCurrent(step.id) ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-ink-600 text-white">
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
                  'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  st === 'locked' && 'cursor-not-allowed text-gray-300 dark:text-gray-600',
                  st !== 'locked' && current &&
                    'bg-ink-50 font-semibold text-ink-800 ring-1 ring-ink-600/60 dark:bg-ink-500/10 dark:text-ink-300 dark:ring-ink-500/60',
                  st === 'done' && !current &&
                    'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60',
                  st !== 'locked' && !current && st !== 'done' &&
                    'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border',
                    st === 'done' && 'border-ink-600 bg-ink-600 text-white',
                    st === 'current' && 'border-ink-600 bg-card text-ink-700 dark:text-ink-300',
                    st === 'locked' && 'border-border text-gray-300 dark:text-gray-600',
                    st !== 'locked' && st !== 'done' && st !== 'current' && 'border-gray-300 text-gray-500 dark:border-gray-700',
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

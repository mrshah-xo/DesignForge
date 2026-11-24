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
 * lg+: sticky vertical rail with a connecting spine, numbered
 * circles, and check marks for completed steps.
 */
export function Stepper({ currentStep, stepState, onSelect }: StepperProps) {
  const state = (id: number): StepStatus => stepState[id] ?? 'locked'
  // Only the step the user is actually on is highlighted as active;
  // other unlocked steps stay neutral so "where am I" is unambiguous.
  const isActive = (id: number) => currentStep === id

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
              aria-current={isActive(step.id) ? 'step' : undefined}
              aria-disabled={st === 'locked'}
              aria-label={`Step ${step.id}: ${step.label}`}
              onClick={() => onSelect(step.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                st === 'locked' && 'cursor-not-allowed border-border text-gray-300 dark:text-gray-600',
                st !== 'locked' && isActive(step.id) &&
                  'border-primary bg-primary text-primary-foreground',
                st !== 'locked' && !isActive(step.id) &&
                  'border-border bg-card text-gray-700 hover:border-ink-300 hover:text-ink-700 dark:text-gray-300 dark:hover:border-ink-500/50',
              )}
            >
              {st === 'done' && !isActive(step.id) ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-ink-600 text-white dark:bg-ink-300 dark:text-ink-900">
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

      {/* lg+: vertical rail with connecting spine */}
      <ol className="relative hidden flex-col gap-1 lg:flex">
        <span
          aria-hidden="true"
          className="absolute bottom-6 left-[26px] top-6 w-px bg-border"
        />
        {STEPS.map((step) => {
          const st = state(step.id)
          const active = isActive(step.id)
          return (
            <li key={step.id} className="relative">
              <button
                type="button"
                disabled={st === 'locked'}
                aria-current={active ? 'step' : undefined}
                aria-label={`Step ${step.id}: ${step.label}`}
                onClick={() => onSelect(step.id)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  st === 'locked' && 'cursor-not-allowed text-gray-300 dark:text-gray-600',
                  st !== 'locked' && active &&
                    'bg-ink-50 font-semibold text-ink-800 dark:bg-ink-500/10 dark:text-ink-300',
                  st !== 'locked' && !active &&
                    'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border bg-card font-semibold transition-colors',
                    st === 'done' && !active &&
                      'border-ink-600 bg-ink-600 text-white dark:border-ink-300 dark:bg-ink-300 dark:text-ink-900',
                    active &&
                      'border-primary bg-card text-primary ring-2 ring-primary/25',
                    st === 'locked' && 'border-border bg-card text-gray-300 dark:text-gray-600',
                    st !== 'locked' && !active && st !== 'done' &&
                      'border-gray-300 bg-card text-gray-500 dark:border-gray-700',
                  )}
                >
                  {st === 'done' && !active ? (
                    <Check className="size-3.5" />
                  ) : (
                    <span className="text-xs">{step.id}</span>
                  )}
                </span>
                <span className="flex-1 truncate">{step.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

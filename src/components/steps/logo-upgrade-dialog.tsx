'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, WandSparkles } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { VenomButton } from '@/components/wizard/venom-button'
import { copyToClipboard } from '@/lib/client/api'

interface LogoUpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The full one-shot prompt, built live from the fit report. */
  prompt: string
}

/** The 3-step round trip, one glanceable row. */
const STEPS = ['Copy the prompt', 'Attach your logo + paste', 'Re-upload & regenerate']

/**
 * Copy button with its own "copied" state. Lives inside DialogContent,
 * which Radix unmounts on close - so the state resets naturally on
 * reopen without a reset-on-prop-change effect.
 */
function CopyUpgradeButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(t)
  }, [copied])

  const copyPrompt = async () => {
    try {
      await copyToClipboard(prompt)
      setCopied(true)
    } catch {
      toast.error('Could not copy automatically', {
        description: 'Select the prompt text manually and copy it.',
      })
    }
  }

  return (
    <VenomButton onClick={() => void copyPrompt()}>
      {copied ? (
        <>
          <Check className="size-4" />
          Copied - paste it into your tool
        </>
      ) : (
        <>
          <Copy className="size-4" />
          Copy upgrade prompt
        </>
      )}
    </VenomButton>
  )
}

export function LogoUpgradeDialog({ open, onOpenChange, prompt }: LogoUpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WandSparkles className="size-5 text-ink-600 dark:text-ink-300" />
            Want a logo upgrade prompt?
          </DialogTitle>
          <DialogDescription>
            Paste it into ChatGPT or any image tool - it carries your fit report.
          </DialogDescription>
        </DialogHeader>

        <ol className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-xs font-bold text-ink-700 dark:bg-ink-500/10 dark:text-ink-200">
                {i + 1}
              </span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{label}</span>
            </li>
          ))}
        </ol>

        <Textarea
          readOnly
          value={prompt}
          rows={14}
          aria-label="Logo upgrade agent prompt"
          onFocus={(e) => e.currentTarget.select()}
          className="max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed"
        />

        <CopyUpgradeButton prompt={prompt} />
      </DialogContent>
    </Dialog>
  )
}

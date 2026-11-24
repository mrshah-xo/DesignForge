'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, ImageUp, Info, WandSparkles } from 'lucide-react'
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

/** The 3-step round trip, shown as a compact numbered strip. */
const STEPS = [
  { title: 'Copy the prompt', text: 'It carries the fit report: score, issues, palette, audience.' },
  { title: 'Generate in your tool', text: 'Attach your current logo + paste the prompt into ChatGPT, Midjourney, Ideogram or Gemini.' },
  { title: 'Re-upload & regenerate', text: 'Download the upgraded logo, upload it in step 1, generate again to re-score.' },
]

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
          Copied - paste it into your image tool
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
            Paste this into ChatGPT or any image tool (Midjourney, Ideogram, Gemini, Canva…).
            It carries your fit report - score, issues, palette and audience - so the tool
            upgrades your actual logo instead of guessing, and aims for a near-100 fit.
          </DialogDescription>
        </DialogHeader>

        <ol className="mt-1 space-y-2">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-xs font-bold text-ink-700 dark:bg-ink-500/10 dark:text-ink-200">
                {i + 1}
              </span>
              <span className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-gray-900 dark:text-gray-50">{s.title}</span>
                {' - '}
                {s.text}
              </span>
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

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            The prompt is built live from this fit report - if you regenerate the design (or
            edit the audience), open this again to refresh it with the latest findings.
          </span>
        </div>

        <CopyUpgradeButton prompt={prompt} />

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ImageUp className="size-3.5" />
          Back from your tool with a new logo? Upload it in step 1, then generate again - the
          fit report re-scores the new file automatically.
        </p>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Loader2, Wand2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { VenomButton } from '@/components/wizard/venom-button'
import { api, copyToClipboard } from '@/lib/client/api'
import {
  BRIEF_PROMPT,
  FIELD_LABELS,
  mergeBriefs,
  parseBriefLocally,
  type ParsedBrief,
} from '@/lib/brief'

interface BriefDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once with the parsed brief (name/description + audience fields). */
  onApply: (brief: ParsedBrief) => void
}

export function BriefDialog({ open, onOpenChange, onApply }: BriefDialogProps) {
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [extracting, setExtracting] = useState(false)

  // Reset state when the dialog closes so a fresh paste starts clean.
  useEffect(() => {
    if (!open) {
      setPasted('')
      setExtracting(false)
    }
  }, [open])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(t)
  }, [copied])

  const copyPrompt = async () => {
    try {
      await copyToClipboard(BRIEF_PROMPT)
      setCopied(true)
    } catch {
      toast.error('Could not copy automatically', {
        description: 'Select the prompt text manually and copy it.',
      })
    }
  }

  const apply = (brief: ParsedBrief) => {
    const labels = brief.found.map((f) => FIELD_LABELS[f] ?? f).join(', ')
    toast.success('Brief applied', {
      description: `Filled: ${labels}.`,
    })
    onApply(brief)
    onOpenChange(false)
  }

  const handleAutofill = async () => {
    const text = pasted.trim()
    if (!text || extracting) return

    // Fast path: the tolerant local parser handles the exact brief block
    // (and most structured replies) instantly, with no network call.
    const local = parseBriefLocally(text)
    if (local.found.length >= 3) {
      apply(local)
      return
    }

    // Fallback: free-form text → LLM extraction, merged over the local parse.
    setExtracting(true)
    try {
      const { brief: ai } = await api.parseBrief(text)
      const merged = mergeBriefs(ai, local)
      if (merged.found.length === 0) {
        toast.error('No brief fields found', {
          description:
            'Ask your agent to reply with the MRDESIGN_BRIEF block, then paste that reply here.',
        })
      } else {
        apply(merged)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again.'
      if (local.found.length > 0) {
        // Extraction failed, but we still recognized a field or two locally.
        apply(local)
      } else if (/credential|not configured|ZAI_BASE_URL/i.test(msg)) {
        toast.error('AI extraction is unavailable', {
          description:
            'Paste the full MRDESIGN_BRIEF block instead - it fills every field instantly.',
        })
      } else {
        toast.error('Could not read the brief', { description: msg })
      }
    } finally {
      setExtracting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-ink-600 dark:text-ink-300" />
            Want a prompt?
          </DialogTitle>
          <DialogDescription>
            Paste your agent's reply here - every field fills in automatically.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="copy" className="mt-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="copy">1 · Copy prompt</TabsTrigger>
            <TabsTrigger value="paste">2 · Paste reply</TabsTrigger>
          </TabsList>

          {/* Step 1 - copy the prompt into the AI assistant */}
          <TabsContent value="copy" className="mt-3 space-y-3">
            <Textarea
              readOnly
              value={BRIEF_PROMPT}
              rows={14}
              aria-label="Agent prompt template"
              onFocus={(e) => e.currentTarget.select()}
              className="max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed"
            />
            <VenomButton onClick={() => void copyPrompt()}>
              {copied ? (
                <>
                  <Check className="size-4" />
                  Copied - paste it into your agent
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy prompt
                </>
              )}
            </VenomButton>
          </TabsContent>

          {/* Step 2 - paste the agent's reply back */}
          <TabsContent value="paste" className="mt-3 space-y-3">
            <Textarea
              placeholder="Paste your agent's one-shot reply here - the MRDESIGN_BRIEF block fills everything instantly, even free-form text works…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={9}
              aria-label="Agent reply"
              className="max-h-72 overflow-y-auto"
            />
            <VenomButton
              disabled={!pasted.trim() || extracting}
              onClick={() => void handleAutofill()}
            >
              {extracting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Reading your brief…
                </>
              ) : (
                <>
                  <Wand2 className="size-4" />
                  Autofill my info
                </>
              )}
            </VenomButton>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

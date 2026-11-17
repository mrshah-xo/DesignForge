'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Info, Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
      description: `Filled: ${labels}. Review the fields, then continue.`,
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
            'Ask your agent to reply with the DESIGNFORGE_BRIEF block, then paste that reply here.',
        })
      } else {
        apply(merged)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again.'
      if (local.found.length > 0) {
        // Extraction failed, but we still recognized a field or two locally.
        apply(local)
      } else if (/credential|z-ai-config|ZAI_BASE_URL/i.test(msg)) {
        toast.error('AI extraction is unavailable', {
          description:
            'Paste the full DESIGNFORGE_BRIEF block from your agent instead — it fills every field instantly, no AI needed on this side.',
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
            <Wand2 className="size-5 text-ember-600 dark:text-ember-400" />
            Want a prompt?
          </DialogTitle>
          <DialogDescription>
            Skip typing every time: copy this prompt into your coding agent (ChatGPT, Claude,
            Gemini, your IDE agent…). It already knows your product, so it answers all 8 fields
            in one message — paste that reply back here and every field fills in automatically,
            then we jump straight to Research review.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="copy" className="mt-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="copy">1 · Copy prompt</TabsTrigger>
            <TabsTrigger value="paste">2 · Paste reply</TabsTrigger>
          </TabsList>

          {/* Step 1 — copy the prompt into the coding agent */}
          <TabsContent value="copy" className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Paste this into your coding agent. It replies with the filled{' '}
              <span className="font-mono text-[11px]">DESIGNFORGE_BRIEF</span> block in one
              message — no interview.
            </p>
            <Textarea
              readOnly
              value={BRIEF_PROMPT}
              rows={14}
              aria-label="Agent prompt template"
              onFocus={(e) => e.currentTarget.select()}
              className="max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed"
            />
            <Button variant="outline" className="w-full" onClick={() => void copyPrompt()}>
              {copied ? (
                <>
                  <Check className="size-4 text-ember-600" />
                  Copied — paste it into your agent
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy prompt
                </>
              )}
            </Button>
          </TabsContent>

          {/* Step 2 — paste the agent's reply back */}
          <TabsContent value="paste" className="mt-3 space-y-3">
            <Textarea
              placeholder="Paste your agent's one-shot reply here — the DESIGNFORGE_BRIEF block fills everything instantly, even free-form text works…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={9}
              aria-label="Agent reply"
              className="max-h-72 overflow-y-auto"
            />
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Your logo file is still uploaded on this page — the brief fills every text
                field, and we jump straight to Research review (step 4).
              </span>
            </div>
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-ember-600"
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
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

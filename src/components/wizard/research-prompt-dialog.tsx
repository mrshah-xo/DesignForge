'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { copyToClipboard } from '@/lib/client/api'
import {
  buildResearchPrompt,
  parseResearchLocally,
  PARSE_RESEARCH_MAX_CHARS,
  type ParsedResearch,
  type ResearchPromptContext,
} from '@/lib/research'

interface ResearchPromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Project + current report context used to build the agent prompt. */
  context: ResearchPromptContext
  /** Called once with the parsed research fixes; the parent merges + saves. */
  onApply: (parsed: ParsedResearch) => void
}

export function ResearchPromptDialog({
  open,
  onOpenChange,
  context,
  onApply,
}: ResearchPromptDialogProps) {
  const [fixNotes, setFixNotes] = useState('')
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [applying, setApplying] = useState(false)

  // Reset state when the dialog closes so a fresh paste starts clean.
  useEffect(() => {
    if (!open) {
      setFixNotes('')
      setPasted('')
      setApplying(false)
    }
  }, [open])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(t)
  }, [copied])

  const prompt = useMemo(
    () => buildResearchPrompt({ ...context, extraInstructions: fixNotes }),
    [context, fixNotes],
  )

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

  const handleApply = () => {
    const text = pasted.trim()
    if (!text || applying) return
    setApplying(true)
    try {
      if (text.length > PARSE_RESEARCH_MAX_CHARS) {
        toast.error('Reply is too long', {
          description: 'Ask your agent to return just the MRDESIGN_RESEARCH block.',
        })
        return
      }
      const parsed = parseResearchLocally(text)
      if (parsed.found.length === 0) {
        toast.error('No research sections found', {
          description:
            'Ask your agent to reply with the MRDESIGN_RESEARCH block, then paste that reply here.',
        })
        return
      }
      const labels = parsed.found.join(', ')
      toast.success('Research applied', {
        description: `Updated: ${labels}.`,
      })
      onApply(parsed)
      onOpenChange(false)
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-ink-600 dark:text-ink-300" />
            Want a research prompt?
          </DialogTitle>
          <DialogDescription>
            Have your agent fix the weak sections, then paste its reply back.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="copy" className="mt-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="copy">1 · Copy prompt</TabsTrigger>
            <TabsTrigger value="paste">2 · Paste reply</TabsTrigger>
          </TabsList>

          {/* Step 1 - copy the prompt into the AI assistant */}
          <TabsContent value="copy" className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="research-fix-notes" className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Anything to fix? <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="research-fix-notes"
                placeholder="e.g. The trust factors are too generic - our audience is clinic admins, not patients. Also add 2 competitors from the EU market…"
                value={fixNotes}
                onChange={(e) => setFixNotes(e.target.value)}
                rows={2}
                className="min-h-16"
              />
            </div>
            <Textarea
              readOnly
              value={prompt}
              rows={14}
              aria-label="Research review agent prompt"
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
              placeholder="Paste your agent's one-shot reply here - the MRDESIGN_RESEARCH block updates the report instantly, even loose field lines work…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={9}
              aria-label="Agent research reply"
              className="max-h-72 overflow-y-auto"
            />
            <VenomButton
              disabled={!pasted.trim() || applying}
              onClick={handleApply}
            >
              {applying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Reading the report…
                </>
              ) : (
                <>
                  <Wand2 className="size-4" />
                  Apply research fixes
                </>
              )}
            </VenomButton>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

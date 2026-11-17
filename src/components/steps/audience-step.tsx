'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CATEGORIES,
  MONETIZATION,
  PLATFORMS,
  TRUST_LEVELS,
  type AudienceData,
  type CategoryValue,
  type ProjectDetail,
} from '@/lib/types'

interface AudienceStepProps {
  project: ProjectDetail
  saving: boolean
  onSave: (audience: AudienceData) => Promise<void>
}

const MONEY_MONETIZATION = ['subscription', 'per_use', 'marketplace']

const categoryLabel = (value: CategoryValue): string =>
  CATEGORIES.find((c) => c.value === value)?.label ?? value

export function AudienceStep({ project, saving, onSave }: AudienceStepProps) {
  const existing = project.audience

  const [category, setCategory] = useState<CategoryValue | ''>(existing?.category ?? '')
  const [audienceDesc, setAudienceDesc] = useState(existing?.audienceDesc ?? '')
  const [platform, setPlatform] = useState(existing?.platform ?? PLATFORMS[0].value)
  const [monetization, setMonetization] = useState(existing?.monetization ?? MONETIZATION[0].value)
  const [trustNeed, setTrustNeed] = useState(existing?.trustNeed ?? TRUST_LEVELS[1].value)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // The form is prefilled once at mount from `project.audience`.
  // The shell remounts this step (keyed by project id) when a different
  // project is loaded, so a prefill effect is unnecessary.

  const hasDownstreamWork = !!project.research || !!project.design
  const canSave = category !== '' && audienceDesc.trim().length > 0 && !saving

  const handleMonetizationChange = (value: string) => {
    setMonetization(value)
    if (MONEY_MONETIZATION.includes(value) && trustNeed !== 'critical') {
      setTrustNeed('critical')
      toast.info('Trust need set to Critical', {
        description: 'Money changes hands here — users must trust you before they pay.',
      })
    }
  }

  const buildAudience = (): AudienceData => {
    // canSave guarantees a category is chosen; 'other' is a safe fallback.
    const resolved: CategoryValue = category || 'other'
    return {
      category: resolved,
      categoryLabel: categoryLabel(resolved),
      audienceDesc: audienceDesc.trim(),
      platform,
      monetization,
      trustNeed,
      notes: notes.trim(),
    }
  }

  const submit = () => {
    if (!canSave) return
    if (hasDownstreamWork) {
      setConfirmOpen(true)
    } else {
      void onSave(buildAudience())
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-ember-50 text-ember-600 dark:bg-ember-500/10 dark:text-ember-400">
            <Users className="size-4" />
          </span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Who will use it?</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Research quality depends on this — the more specific, the better.
        </p>

        <div className="mt-6 space-y-5">
          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="audience-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as CategoryValue)}
            >
              <SelectTrigger id="audience-category" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category !== '' && (
              <p className="text-xs text-muted-foreground">
                {CATEGORIES.find((c) => c.value === category)?.hint}
              </p>
            )}
          </div>

          {/* Audience description */}
          <div className="space-y-1.5">
            <Label htmlFor="audience-desc">
              Describe your audience <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="audience-desc"
              required
              placeholder="e.g. small business owners in their 30s who sell online and worry about getting paid"
              value={audienceDesc}
              onChange={(e) => setAudienceDesc(e.target.value)}
              rows={3}
            />
          </div>

          {/* Platform */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="audience-platform">Primary platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="audience-platform" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Monetization */}
            <div className="space-y-1.5">
              <Label htmlFor="audience-monetization">Monetization</Label>
              <Select value={monetization} onValueChange={handleMonetizationChange}>
                <SelectTrigger id="audience-monetization" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONETIZATION.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Trust need */}
          <div className="space-y-1.5">
            <Label htmlFor="audience-trust">How much trust does your product need?</Label>
            <Select value={trustNeed} onValueChange={setTrustNeed}>
              <SelectTrigger id="audience-trust" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRUST_LEVELS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="audience-notes">
              Extra notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="audience-notes"
              placeholder="Anything else the research should know…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={280}
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={submit}
              disabled={!canSave}
              className="bg-primary text-primary-foreground hover:bg-ember-600"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Save & continue
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Confirm reset of downstream work */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite research & design?</DialogTitle>
            <DialogDescription>
              Saving an edited audience resets the research report and the generated design system
              for this project, since they were built for the old audience. You can run research
              again afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-ember-600"
              onClick={() => {
                setConfirmOpen(false)
                void onSave(buildAudience())
              }}
            >
              Save audience
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

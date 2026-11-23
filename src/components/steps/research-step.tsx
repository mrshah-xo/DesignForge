'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Loader2,
  Pencil,
  Save,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DesignGenerating, type LiveProgress } from '@/components/wizard/design-generating'
import { DESIGN_MESSAGES, RESEARCH_MESSAGES } from '@/components/wizard/progress-messages'
import { ResearchPromptDialog } from '@/components/wizard/research-prompt-dialog'
import { StatusBadge } from '@/components/wizard/status-badge'
import { mergeParsedResearch } from '@/lib/research'
import type { ParsedResearch, ResearchPromptContext } from '@/lib/research'
import type {
  CompetitorBrand,
  ProjectDetail,
  ResearchData,
  ResearchSection,
  ResearchSections,
  ResearchSource,
} from '@/lib/types'

interface ResearchStepProps {
  project: ProjectDetail
  researching: boolean
  generating: boolean
  savingEdits: boolean
  approving: boolean
  /** Live pipeline steps (what the AI is actually searching/writing). */
  researchLive: LiveProgress | null
  designLive: LiveProgress | null
  onRunResearch: () => Promise<void>
  onSaveEdits: (payload: { sections: ResearchSections; sources: ResearchSource[] }) => Promise<void>
  onApproveAndGenerate: (payload: {
    sections: ResearchSections
    sources: ResearchSource[]
  }) => Promise<void>
  onGenerateDesign: () => Promise<void>
  onOpenDesign: () => void
}

// ---------- Draft model (brands get local ids for stable React keys) ----------
type SectionKey = keyof ResearchSections
type BrandRow = CompetitorBrand & { _id: string }

interface ResearchDraft {
  sections: {
    audiencePsychology: ResearchSection
    trustFactors: ResearchSection
    successfulPatterns: ResearchSection
    competitorLogos: { title: string; body: string }
    colorTheory: ResearchSection
    commonMistakes: ResearchSection
  }
  brands: BrandRow[]
  sources: ResearchSource[]
}

const SECTION_META: { key: SectionKey; label: string; blurb: string }[] = [
  {
    key: 'audiencePsychology',
    label: 'Audience psychology',
    blurb: 'What motivates, worries and convinces the people you are building for.',
  },
  {
    key: 'trustFactors',
    label: 'Trust factors',
    blurb: 'The signals that make this audience believe — and pay.',
  },
  {
    key: 'successfulPatterns',
    label: 'Successful patterns',
    blurb: 'Visual patterns proven to work with audiences like yours.',
  },
  {
    key: 'competitorLogos',
    label: 'Competitor logos',
    blurb: 'How similar brands look, and what their choices communicate.',
  },
  {
    key: 'colorTheory',
    label: 'Color theory',
    blurb: 'Color psychology applied to your category and audience.',
  },
  {
    key: 'commonMistakes',
    label: 'Common mistakes',
    blurb: 'Design choices that erode trust with this audience.',
  },
]

const emptySection = (): ResearchSection => ({ title: '', body: '', bullets: [] })

function normalizeDraft(research: ResearchData | null): ResearchDraft {
  const s = research?.sections
  return {
    sections: {
      audiencePsychology: { ...emptySection(), ...(s?.audiencePsychology ?? {}) },
      trustFactors: { ...emptySection(), ...(s?.trustFactors ?? {}) },
      successfulPatterns: { ...emptySection(), ...(s?.successfulPatterns ?? {}) },
      competitorLogos: {
        title: s?.competitorLogos?.title ?? '',
        body: s?.competitorLogos?.body ?? '',
      },
      colorTheory: { ...emptySection(), ...(s?.colorTheory ?? {}) },
      commonMistakes: { ...emptySection(), ...(s?.commonMistakes ?? {}) },
    },
    brands: (s?.competitorLogos?.brands ?? []).map((b) => ({
      _id: newBrandId(),
      name: b?.name ?? '',
      colors: b?.colors ?? '',
      approach: b?.approach ?? '',
    })),
    sources: (research?.sources ?? []).map((src) => ({
      name: src?.name ?? '',
      url: src?.url ?? '',
      note: src?.note ?? '',
    })),
  }
}

/** Generate a stable local id for brand rows (never derived from list index). */
function newBrandId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `brand-${crypto.randomUUID()}`
  }
  return `brand-${Math.random().toString(36).slice(2, 10)}`
}

/** Assemble the server payload sections from a draft (pure — safe anywhere). */
function buildSectionsFromDraft(d: ResearchDraft): ResearchSections {
  return {
    audiencePsychology: d.sections.audiencePsychology,
    trustFactors: d.sections.trustFactors,
    successfulPatterns: d.sections.successfulPatterns,
    competitorLogos: {
      title: d.sections.competitorLogos.title,
      body: d.sections.competitorLogos.body,
      brands: d.brands.map((b) => ({ name: b.name, colors: b.colors, approach: b.approach })),
    },
    colorTheory: d.sections.colorTheory,
    commonMistakes: d.sections.commonMistakes,
  }
}

export function ResearchStep({
  project,
  researching,
  generating,
  savingEdits,
  approving,
  researchLive,
  designLive,
  onRunResearch,
  onSaveEdits,
  onApproveAndGenerate,
  onGenerateDesign,
  onOpenDesign,
}: ResearchStepProps) {
  const research = project.research
  // The draft is initialized once at mount from the server research.
  // The shell remounts this step (keyed by project id + research nonce)
  // whenever server research changes, keeping the draft in sync without
  // a setState-in-effect round trip. This also protects in-progress edits
  // from background detail refreshes.
  const [draft, setDraft] = useState<ResearchDraft>(() => normalizeDraft(research))
  const [editing, setEditing] = useState<Partial<Record<SectionKey, boolean>>>({})
  const [promptOpen, setPromptOpen] = useState(false)

  const buildSections = () => buildSectionsFromDraft(draft)

  // Context for the "Want a research prompt?" dialog. Memoized before the
  // early returns below (no-research / generating states render other UI).
  const promptContext = useMemo<ResearchPromptContext>(() => {
    const audience = project.audience
    return {
      name: project.name,
      description: project.description,
      category: audience?.categoryLabel || audience?.category || null,
      audienceDesc: audience?.audienceDesc ?? null,
      platform: audience?.platform ?? null,
      monetization: audience?.monetization ?? null,
      trustNeed: audience?.trustNeed ?? null,
      notes: audience?.notes ?? null,
      sections: research ? buildSectionsFromDraft(draft) : null,
    }
  }, [project, research, draft])

  /** Apply the agent's parsed fixes to the draft, then persist them. */
  const applyParsed = (parsed: ParsedResearch) => {
    const merged = mergeParsedResearch(parsed, { sections: buildSections(), sources: draft.sources })
    setDraft({
      sections: merged.sections,
      brands: merged.sections.competitorLogos.brands.map((b) => ({
        _id: newBrandId(),
        name: b.name,
        colors: b.colors,
        approach: b.approach,
      })),
      sources: merged.sources,
    })
    void onSaveEdits({ sections: merged.sections, sources: merged.sources })
  }

  // ---------- No research yet ----------
  if (!research) {
    if (researching) {
      return (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <DesignGenerating
            messages={RESEARCH_MESSAGES}
            live={researchLive}
            subtext="Real web search runs under the hood — every step is shown live."
          />
        </div>
      )
    }
    return (
      <section className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-ember-50 text-ember-600 dark:bg-ember-500/10 dark:text-ember-400">
          <BookOpenCheck className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
          Automatic audience research
        </h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
          We research your audience&apos;s psychology, trust factors, successful design patterns,
          competitor logos, color theory — then you review before anything is generated. Real web
          search runs under the hood, so this takes 20–90 seconds.
        </p>
        <div>
          <Button
            onClick={() => void onRunResearch()}
            className="mt-6 bg-primary text-primary-foreground hover:bg-ember-600"
          >
            <Sparkles className="size-4" />
            Run automatic research
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPromptOpen(true)}
          className="mt-2 gap-1.5 text-xs text-muted-foreground"
        >
          <Wand2 className="size-3.5" />
          Or have your agent write it — &quot;Want a prompt?&quot;
        </Button>
        <ResearchPromptDialog
          open={promptOpen}
          onOpenChange={setPromptOpen}
          context={promptContext}
          onApply={applyParsed}
        />
      </section>
    )
  }

  // ---------- Design generation in progress ----------
  if (generating) {
    return (
      <div className="rounded-lg border border-border bg-card shadow-sm">
        <DesignGenerating
          messages={DESIGN_MESSAGES}
          live={designLive}
          subtext="Tokens, accessibility checks and your DESIGN.md are generated in sequence."
        />
      </div>
    )
  }

  const approved = research.status === 'approved'
  const designExists = !!project.design
  const payload = { sections: buildSections(), sources: draft.sources }

  // ---------- Draft mutators ----------
  const patchSection = (key: Exclude<SectionKey, 'competitorLogos'>, patch: Partial<ResearchSection>) => {
    setDraft((d) => ({ ...d, sections: { ...d.sections, [key]: { ...d.sections[key], ...patch } } }))
  }
  const patchCompetitorMeta = (patch: Partial<{ title: string; body: string }>) => {
    setDraft((d) => ({
      ...d,
      sections: { ...d.sections, competitorLogos: { ...d.sections.competitorLogos, ...patch } },
    }))
  }
  const patchBrand = (id: string, patch: Partial<CompetitorBrand>) => {
    setDraft((d) => ({
      ...d,
      brands: d.brands.map((b) => (b._id === id ? { ...b, ...patch } : b)),
    }))
  }
  const toggleEdit = (key: SectionKey) => {
    setEditing((e) => ({ ...e, [key]: !e[key] }))
  }

  const renderSectionCard = (key: SectionKey, label: string, blurb: string) => {
    const isEditing = !!editing[key]
    return (
      <motion.section
        key={key}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">{label}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleEdit(key)}
            aria-pressed={isEditing}
            className="shrink-0 gap-1.5 text-xs"
          >
            {isEditing ? (
              <>
                <X className="size-3.5" />
                Close
              </>
            ) : (
              <>
                <Pencil className="size-3.5" />
                Edit
              </>
            )}
          </Button>
        </div>

        {isEditing ? (
          <div className="space-y-3">
            {key === 'competitorLogos' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor={`${key}-title`} className="text-xs">Title</Label>
                  <Input
                    id={`${key}-title`}
                    value={draft.sections.competitorLogos.title}
                    onChange={(e) => patchCompetitorMeta({ title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${key}-body`} className="text-xs">Summary</Label>
                  <Textarea
                    id={`${key}-body`}
                    value={draft.sections.competitorLogos.body}
                    onChange={(e) => patchCompetitorMeta({ body: e.target.value })}
                    rows={3}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Brands</Label>
                  <div className="space-y-2">
                    {draft.brands.map((brand) => (
                      <div
                        key={brand._id}
                        className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr] lg:grid-cols-[1fr_1.4fr_1.6fr]"
                      >
                        <Input
                          aria-label="Brand name"
                          placeholder="Brand name"
                          value={brand.name}
                          onChange={(e) => patchBrand(brand._id, { name: e.target.value })}
                          className="text-xs"
                        />
                        <Input
                          aria-label="Brand colors"
                          placeholder="Colors"
                          value={brand.colors}
                          onChange={(e) => patchBrand(brand._id, { colors: e.target.value })}
                          className="text-xs"
                        />
                        <Input
                          aria-label="Brand approach"
                          placeholder="Approach"
                          value={brand.approach}
                          onChange={(e) => patchBrand(brand._id, { approach: e.target.value })}
                          className="text-xs sm:col-span-2 lg:col-span-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor={`${key}-title`} className="text-xs">Title</Label>
                  <Input
                    id={`${key}-title`}
                    value={draft.sections[key].title}
                    onChange={(e) => patchSection(key, { title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${key}-body`} className="text-xs">Body</Label>
                  <Textarea
                    id={`${key}-body`}
                    value={draft.sections[key].body}
                    onChange={(e) => patchSection(key, { body: e.target.value })}
                    rows={4}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${key}-bullets`} className="text-xs">
                    Key points <span className="font-normal text-muted-foreground">(one per line)</span>
                  </Label>
                  <Textarea
                    id={`${key}-bullets`}
                    value={draft.sections[key].bullets.join('\n')}
                    onChange={(e) => patchSection(key, { bullets: e.target.value.split('\n') })}
                    rows={4}
                    className="min-h-20"
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {key === 'competitorLogos'
                ? draft.sections.competitorLogos.title
                : draft.sections[key].title}
            </h4>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {key === 'competitorLogos'
                ? draft.sections.competitorLogos.body
                : draft.sections[key].body}
            </p>
            {key === 'competitorLogos' ? (
              draft.brands.length > 0 && (
                <ul className="grid gap-2 pt-1 sm:grid-cols-2">
                  {draft.brands.map((brand) => (
                    <li
                      key={brand._id}
                      className="rounded-lg border border-border bg-muted p-3 text-xs"
                    >
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{brand.name}</p>
                      <p className="mt-0.5 text-gray-500 dark:text-gray-400">{brand.colors}</p>
                      <p className="mt-1 text-gray-600 dark:text-gray-300">{brand.approach}</p>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              draft.sections[key].bullets.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {draft.sections[key].bullets.map((b, i) => (
                    <li
                      key={`${key}-bullet-${i}`}
                      className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                    >
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ember-500" aria-hidden="true" />
                      {b}
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        )}
      </motion.section>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Research report</h2>
          <StatusBadge status={research.status} />
          {approved && research.reviewedAt && (
            <span className="text-xs text-muted-foreground">
              Reviewed {new Date(research.reviewedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPromptOpen(true)} className="gap-1.5">
            <Wand2 className="size-3.5" />
            Want a prompt?
          </Button>
          {approved && designExists && (
            <Button variant="outline" size="sm" onClick={onOpenDesign}>
              Open design system
            </Button>
          )}
        </div>
      </div>

      {approved && !designExists && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          Research is approved — generate the design system to continue.
        </p>
      )}

      {/* Sources */}
      {draft.sources.length > 0 && (
        <section aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-50">
            Sources ({draft.sources.length})
          </h2>
          <ul className="max-h-96 space-y-2 overflow-y-auto df-scroll pr-1">
            {draft.sources.map((source, i) => (
              <li
                key={`${source.url}-${i}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {source.name}
                  </p>
                  {source.note && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{source.note}</p>
                  )}
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open source: ${source.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-ember-700 dark:hover:bg-gray-800 dark:hover:text-ember-400"
                >
                  <ExternalLink className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {SECTION_META.map(({ key, label, blurb }) => renderSectionCard(key, label, blurb))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => void onSaveEdits(payload)}
          disabled={savingEdits || approving || generating}
        >
          {savingEdits ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save edits
        </Button>
        {approved && !designExists ? (
          <Button
            onClick={() => void onGenerateDesign()}
            disabled={approving || generating || savingEdits}
            className="bg-primary text-primary-foreground hover:bg-ember-600"
          >
            {approving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate design
          </Button>
        ) : (
          <Button
            onClick={() => void onApproveAndGenerate(payload)}
            disabled={approving || generating || savingEdits}
            className="bg-primary text-primary-foreground hover:bg-ember-600"
          >
            {approving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Approve research & generate design
          </Button>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
        Editing sections is encouraged — approving uses exactly what you see here. Nothing is
        generated until you approve.
      </p>

      <ResearchPromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        context={promptContext}
        onApply={applyParsed}
      />
    </div>
  )
}

// ============================================================
// Logo upgrade prompt - turns the fit report (score, issues,
// suggestions) + logo analysis into a one-shot prompt the user
// pastes into ChatGPT / Midjourney / Ideogram / Gemini or any
// image generation tool. The tool upgrades the logo; the user
// downloads it, re-uploads it on step 1 and regenerates, so the
// fit report re-scores the improved file.
//
// Pure client-side string building - no API, no parsing (the
// tool's reply is an image, not a text block).
// ============================================================

import type {
  AnalysisData,
  LogoFeedback,
  LogoIssue,
  LogoSuggestion,
  PaletteColor,
} from '@/lib/types'

export interface LogoUpgradePromptInput {
  projectName: string
  description?: string | null
  /** Current fit score, 0-100. */
  score: number
  feedback: LogoFeedback | null
  /** Logo analysis (palette / style tags / mood / industry). Optional - older projects may miss it. */
  analysis?: AnalysisData | null
  audienceDesc?: string | null
  categoryLabel?: string | null
}

/** Same thresholds as the fit report gauge labels. */
export function fitLabel(score: number): string {
  if (score >= 75) return 'Strong fit'
  if (score >= 50) return 'Workable fit'
  return 'Needs attention'
}

function listPalette(palette: PaletteColor[]): string {
  if (palette.length === 0) return '- (no palette extracted - describe the colors you want to keep in NOTES below)'
  return palette
    .slice(0, 6)
    .map((c) => `- ${c.hex} - ${c.name} (${Math.round(c.weight)}% dominance)`)
    .join('\n')
}

function listIssues(issues: LogoIssue[]): string {
  if (issues.length === 0)
    return '- None listed - the report found no blocking issues, so this is a polish pass: sharpen contrast, simplify geometry, and tighten optical spacing.'
  return issues
    .map((i, n) => `${n + 1}. [${i.severity.toUpperCase()}] ${i.title} - ${i.detail}`)
    .join('\n')
}

function listSuggestions(suggestions: LogoSuggestion[]): string {
  if (suggestions.length === 0)
    return '- None listed - use the issues above as your fix list.'
  return suggestions
    .map((s, n) => `${n + 1}. ${s.title} - ${s.detail}`)
    .join('\n')
}

/**
 * Build the full one-shot upgrade prompt. Everything the image tool
 * needs rides along: product context, brand DNA (palette, style),
 * the current score and the concrete fix list from the fit report,
 * plus the non-negotiables that drive the score up.
 */
export function buildLogoUpgradePrompt(input: LogoUpgradePromptInput): string {
  const {
    projectName,
    description,
    score,
    feedback,
    analysis,
    audienceDesc,
    categoryLabel,
  } = input

  const verdict = feedback?.verdict?.trim()
  const issues = feedback?.issues ?? []
  const suggestions = feedback?.suggestions ?? []
  const styleTags = analysis?.styleTags ?? []
  const mood = analysis?.mood
  const industry = analysis?.industry || categoryLabel
  const goal = Math.min(100, Math.max(score + 25, 90))

  return `You are a senior logo designer and brand-system specialist. I have attached my CURRENT logo image. Your job: upgrade it so it scores as close to ${goal}/100 as possible on a logo fit report for my product and audience - keep the brand DNA, fix what the report flags, and deliver finished, ready-to-use files in ONE single message. Do NOT interview me and do NOT ask questions; decide sensibly and deliver.

MY PRODUCT
- Name: ${projectName || '(unnamed project)'}
- What it does: ${description?.trim() || '(not specified - infer from the palette and style below)'}
- Industry: ${industry || '(not specified)'}
- Audience: ${audienceDesc?.trim() || '(not specified - infer from the industry)'}

CURRENT LOGO - KEEP THIS DNA
${listPalette(analysis?.palette ?? [])}
- Style tags: ${styleTags.length > 0 ? styleTags.join(', ') : '(not extracted - judge from the attached image)'}
- Mood: ${mood || '(judge from the attached image)'}
- Refine, do not replace: keep the core mark concept and the same color family unless an issue below demands a change, and say so if it does.

CURRENT FIT REPORT - ${score}/100 (${fitLabel(score)})
${verdict ? `Verdict: ${verdict}` : 'Verdict: (not captured - judge the attached image yourself)'}
ISSUES TO FIX (every one of them):
${listIssues(issues)}
SUGGESTIONS FROM THE REPORT:
${listSuggestions(suggestions)}

WHAT A NEAR-100 FIT LOOKS LIKE (non-negotiables, on top of the issues above)
1. Legible and recognizable at 16px (favicon) AND at billboard size.
2. Works in pure black, pure white and single-color versions - no color-dependent shapes.
3. High contrast against both light and dark surfaces; avoid mid-tone mush.
4. Simple geometry: no fine detail, hairline strokes, fragile gradients or photo-realistic effects that break when scaled.
5. Balanced optical spacing and proportions, drawn on a consistent grid.
6. Crisp vector-style edges, flat fills, transparent background - no raster noise, no drop shadows baked in.

DELIVER, IN ONE MESSAGE
1. 3-4 upgraded variants of the logo (attach as transparent-background PNG; SVG if your tool supports it). Vary the treatment, not the brand DNA.
2. For the best variant: mark-only version AND a full lockup (mark + wordmark).
3. One monochrome (single-color) version of the best variant.
4. 2-3 sentences per variant: exactly what you changed and why it lifts the fit score.
NOTES (anything I want you to honor): none`
}

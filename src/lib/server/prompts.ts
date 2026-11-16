// ============================================================
// LLM prompt builders for the DesignForge pipelines (server only).
// Keep every required JSON key and rule intact when refining wording.
// ============================================================

import type { AnalysisData, AudienceData, DesignTokens, LogoFeedback, ResearchData } from '@/lib/types';

// ---------- system prompts ----------

export const ANALYSIS_SYSTEM =
  'You are a senior brand designer and color scientist. Respond with ONLY a valid JSON object. No markdown fences, no commentary.';

export const RESEARCH_SYSTEM =
  'You are a design researcher specializing in consumer psychology and trust UX. Respond with ONLY a valid JSON object. No markdown fences.';

export const DESIGN_SYSTEM =
  'You are a world-class design director creating design systems. Respond with ONLY a valid JSON object. No markdown fences.';

export const MARKDOWN_SYSTEM =
  'You are the author of world-famous DESIGN.md specifications consumed by AI coding agents. Output ONLY the raw markdown file content. No markdown code fences around the whole file.';

// ---------- shared digest helpers ----------

function compactAnalysis(analysis: AnalysisData): Record<string, unknown> {
  return {
    palette: analysis.palette.map((c) => ({ hex: c.hex, name: c.name, weight: c.weight })),
    styleTags: analysis.styleTags,
    mood: analysis.mood,
    industry: analysis.industry,
    audienceGuess: analysis.audienceGuess,
    trustSignals: analysis.trustSignals,
  };
}

function compactAudience(audience: AudienceData): Record<string, unknown> {
  return {
    category: `${audience.category} (${audience.categoryLabel})`,
    audienceDesc: audience.audienceDesc,
    platform: audience.platform,
    monetization: audience.monetization,
    trustNeed: audience.trustNeed,
    notes: audience.notes,
  };
}

/** Condensed research digest: section titles + bullets (used by design + markdown prompts). */
function digestResearch(research: ResearchData): string {
  const s = research.sections;
  const lines: string[] = [];
  const pushSection = (title: string, body: string, bullets: string[]) => {
    lines.push(`### ${title}`);
    if (body) lines.push(body);
    for (const b of bullets) lines.push(`- ${b}`);
  };
  pushSection(s.audiencePsychology.title, s.audiencePsychology.body, s.audiencePsychology.bullets);
  pushSection(s.trustFactors.title, s.trustFactors.body, s.trustFactors.bullets);
  pushSection(s.successfulPatterns.title, s.successfulPatterns.body, s.successfulPatterns.bullets);
  pushSection(
    s.competitorLogos.title,
    s.competitorLogos.body,
    s.competitorLogos.brands.map(
      (b) => `${b.name} — colors: ${b.colors}; why it works: ${b.approach}`,
    ),
  );
  pushSection(s.colorTheory.title, s.colorTheory.body, s.colorTheory.bullets);
  pushSection(s.commonMistakes.title, s.commonMistakes.body, s.commonMistakes.bullets);
  if (research.sources.length) {
    lines.push(`### Sources consulted`);
    for (const src of research.sources) lines.push(`- ${src.name} (${src.url})`);
  }
  return lines.join('\n');
}

// ---------- 1) Logo analysis (VLM user prompt) ----------

export function buildAnalysisPrompt(projectName: string, description?: string | null): string {
  return `Analyze this logo image for the project "${projectName}" (${description || 'no description provided'}). Return JSON exactly:
{
  "palette": [{ "hex": "#RRGGBB", "name": "human color name", "weight": 0-100 dominance }],
  "styleTags": ["from: flat, minimal, geometric, gradient, 3d, illustrated, wordmark, lettermark, pictorial, mascot, emblem, lineart, vintage, playful, luxury, techy, organic, bold, thin, rounded, sharp"],
  "mood": "one sentence on the emotional tone",
  "temperature": "warm|cool|neutral",
  "industry": "most likely industry",
  "audienceGuess": "who this logo likely targets",
  "trustSignals": ["3-5 elements in the logo that build or undermine trust"],
  "description": "3-4 sentence objective description of shapes, typography, spacing, symbolism"
}`;
}

// ---------- 2) Research ----------

export function buildResearchPrompt(
  project: { name: string; description?: string | null },
  audience: AudienceData,
  analysis: AnalysisData,
  searchResults: Array<{ name: string; url: string; snippet: string }>,
): string {
  return `Research the design and trust psychology for this product.

PROJECT: "${project.name}" — ${project.description || 'no description provided'}

AUDIENCE: ${JSON.stringify(compactAudience(audience))}

LOGO ANALYSIS: ${JSON.stringify(compactAnalysis(analysis))}

WEB SEARCH RESULTS (real internet sources):
${JSON.stringify(searchResults.map((r) => ({ name: r.name, url: r.url, snippet: r.snippet })), null, 1)}

Return JSON with EXACTLY these keys:
{
  "audiencePsychology": { "title": "...", "body": "2-4 sentences", "bullets": ["4-6 strings"] } — how this audience thinks, what they fear, what signals make them feel safe in ${audience.categoryLabel} products,
  "trustFactors": { "title": "...", "body": "...", "bullets": ["4-6"] } — ranked trust levers for this field, ordered by impact (e.g. for fintech: security cues, regulatory badges, transparent pricing),
  "successfulPatterns": { "title": "...", "body": "...", "bullets": ["4-6"] } — concrete UI/design patterns used by successful, trusted products in this field,
  "competitorLogos": { "title": "...", "body": "...", "brands": [{ "name": "...", "colors": "their actual primary/secondary hex or color description", "approach": "why their visual approach works for this audience" }] } — 4-6 real famous brands in this exact field (e.g. Stripe, PayPal, Revolut for fintech; Shopify, Amazon, Etsy for ecommerce) — grounded in your knowledge, and prefer ones corroborated by the search results,
  "colorTheory": { "title": "...", "body": "...", "bullets": ["4-6"] } — recommended color directions, harmony model (e.g. analogous/complementary), contrast and accessibility implications, cultural color associations relevant to the audience,
  "commonMistakes": { "title": "...", "body": "...", "bullets": ["4-6"] } — design mistakes that destroy trust in this field,
  "sources": [{ "name": "...", "url": "...", "note": "..." }] — ONLY from the provided search results you actually used (3-8 items)
}

Rules:
- Every bullet must be specific and actionable (mention concrete colors, patterns, or numbers), not generic platitudes.
- Competitor brands must be real and famous in this exact field.
- If the search results are sparse, rely on your own knowledge, but keep every key present with the required structure.`;
}

// ---------- 3) Design tokens + match analysis ----------

const DESIGN_TOKENS_SCHEMA = `{
  "matchAnalysis": {
    "score": 0-100,
    "verdict": "one paragraph judging how well the logo fits this audience/purpose, referencing specific findings",
    "issues": [{ "severity": "high|medium|low", "title": "...", "detail": "..." }]  // 0-5; empty array if excellent fit
    "suggestions": [{ "title": "...", "detail": "..." }]  // 2-4 concrete logo or usage fixes; if fit is excellent, give refinement suggestions
  },
  "tokens": { ...full DesignTokens JSON schema below... }
}

DesignTokens TypeScript interface (fill every field):
interface ColorToken { hex: string; name: string; usage: string }
interface PaletteStep { step: string; hex: string; name: string }  // step: "50" | "100" | ... | "900", exactly 10 steps
export interface DesignTokens {
  brand: { name: string; personality: string[]; voice: string };
  colors: Record<ColorRole, ColorToken>;  // ColorRole = 'primary' | 'primaryForeground' | 'secondary' | 'accent' | 'background' | 'foreground' | 'muted' | 'mutedForeground' | 'border' | 'success' | 'warning' | 'danger' — ALL 12 roles required, each { hex, name, usage }
  paletteScale: PaletteStep[];  // 10 steps "50".."900"
  typography: {
    heading: { family: string; weights: number[]; letterSpacing: string };
    body: { family: string; weights: number[]; lineHeight: string };
    scale: Record<'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'small' | 'caption', string>;  // CSS lengths, e.g. "2.5rem"
  };
  radius: { sm: string; md: string; lg: string; full: string };
  shadows: { sm: string; md: string; lg: string };
  buttons: { primary: string; secondary: string; shape: string };
  trustPatterns: string[];  // 4-6 UI trust patterns pulled from the research
}`;

export function buildDesignPrompt(
  project: { name: string; description?: string | null },
  audience: AudienceData,
  analysis: AnalysisData,
  research: ResearchData,
): string {
  return `Create the design system and logo-fit report for this project.

PROJECT: "${project.name}" — ${project.description || 'no description provided'}

AUDIENCE: ${JSON.stringify(compactAudience(audience))}

FULL LOGO ANALYSIS: ${JSON.stringify(analysis)}

RESEARCH DIGEST (reviewed findings):
${digestResearch(research)}

${DESIGN_TOKENS_SCHEMA}

Token rules:
- Derive the primary color from the logo palette when it serves the field's psychology.
- If the logo color conflicts with what the audience's psychology demands, shift the primary toward the appropriate hue while keeping the logo's DNA (saturation/lightness family) and explain the shift in matchAnalysis.verdict.
- primary/primaryForeground must meet WCAG AA (contrastRatio >= 4.5 — the system ensures backend re-checks this).
- Typography heading+body families MUST be chosen from this exact list: Inter, Manrope, Poppins, Space Grotesk, Sora, Outfit, IBM Plex Sans, Playfair Display, DM Serif Display, Lora, Merriweather, JetBrains Mono (prefer a heading/body pairing that matches the field, e.g. serif headings for luxury/law/finance gravitas, geometric sans for tech).
- radius/shadows must match the logo styleTags (${analysis.styleTags.join(', ') || 'unknown'}): sharp geometric logo → smaller radius; friendly rounded logo → larger radius.
- trustPatterns: 4-6 UI trust patterns pulled from the research (e.g. 'Show security badges near payment forms').
- brand.personality: 3-6 adjectives; brand.voice: one sentence describing the product voice.`;
}

// ---------- 4) DESIGN.md markdown ----------

export function buildMarkdownPrompt(
  project: { name: string; description?: string | null },
  audience: AudienceData,
  analysis: AnalysisData,
  research: ResearchData,
  tokens: DesignTokens,
  matchAnalysis: LogoFeedback,
): string {
  return `Write the DESIGN.md specification for this project.

PROJECT: "${project.name}" — ${project.description || 'no description provided'}

AUDIENCE: ${JSON.stringify(compactAudience(audience))}

CONDENSED RESEARCH:
${digestResearch(research)}

LOGO ANALYSIS (for logo usage notes): ${JSON.stringify({
    palette: analysis.palette.map((c) => ({ hex: c.hex, name: c.name })),
    styleTags: analysis.styleTags,
    mood: analysis.mood,
    trustSignals: analysis.trustSignals,
    description: analysis.description,
  })}

LOGO FIT REPORT: ${JSON.stringify(matchAnalysis)}

FINAL NORMALIZED TOKENS (every color you write MUST come from this JSON):
${JSON.stringify(tokens, null, 1)}

Write DESIGN.md for the project with this EXACT outline and rules:

- H1 \`# DESIGN.md — ${project.name}\` then a blockquote: '> Agent-ready design system specification generated by DesignForge. Paste this file into Cursor, v0, Lovable, Claude Code, or any AI builder to produce consistent, on-brand UI.'
- Sections (H2, numbered):
  1. Brand snapshot
  2. Audience psychology & trust strategy (cite the research findings: what the audience fears, what builds trust — 4-6 bullets)
  3. Color system (markdown table token|hex|usage for ALL 12 roles + palette scale strip as a table + a note on the primary's contrast ratio)
  4. Typography (families with Google Fonts import line \`@import url(...)\` for both families, weights, scale table h1..caption, usage rules)
  5. Layout & spacing (grid, 4px base scale, section rhythm, container widths)
  6. Component specifications (Button primary/secondary/outline/ghost/disabled, Input, Card, Navbar, Footer, Badge, Alert, Modal, Pricing card, Testimonial — each with exact token-based styling: padding, radius, colors, font sizes, hover/focus states)
  7. Imagery & iconography (icon style + stroke width, illustration direction, photo treatment)
  8. Motion (durations 150-300ms, easing, what may animate)
  9. Voice & microcopy (tone, CTA style with 3 examples, error message tone with 2 examples)
  10. Accessibility & contrast (WCAG AA minimums, focus ring spec, touch targets 44px)
  11. Logo usage notes (clear space, minimum sizes, approved backgrounds from palette, do/don't list — derived from the actual analysis + matchAnalysis suggestions)
  12. Do / Don't summary (table)

Rules:
- Every color MUST be a concrete hex from the tokens JSON above.
- No placeholders (never write TBD or [color]).
- Concise bullet style, tables where specified, total ~250-400 lines.
- Output ONLY the raw markdown file content. Do not wrap the whole file in markdown code fences.`;
}

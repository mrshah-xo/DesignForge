// ============================================================
// LLM prompt builders for the DesignForge pipelines (server only).
// Keep every required JSON key and rule intact when refining wording.
// ============================================================

import type { AnalysisData, AudienceData, DesignTokens, LogoFeedback, ResearchData } from '@/lib/types';
import { DESIGN_CORPUS, DESIGN_CORPUS_DIGEST } from '@/lib/server/design-corpus';

// ---------- system prompts ----------

export const ANALYSIS_SYSTEM =
  'You are a senior brand designer and color scientist. Respond with ONLY a valid JSON object. No markdown fences, no commentary.';

export const RESEARCH_SYSTEM =
  'You are a design researcher specializing in consumer psychology and trust UX. Respond with ONLY a valid JSON object. No markdown fences.';

export const DESIGN_SYSTEM =
  'You are a world-class design director creating design systems. Respond with ONLY a valid JSON object. No markdown fences.';

export const MARKDOWN_SYSTEM =
  'You are the author of world-famous DESIGN.md specifications consumed by AI coding agents. ' +
  'Your writing has been trained on production exemplars (Apple, Tesla, Ollama, VoltAgent, Vercel Geist, Nike, 1win): ' +
  'every sentence carries a concrete value (px, hex, weight, ms, ratio), organized strictly by category. ' +
  'Output ONLY the raw markdown file content. No markdown code fences around the whole file.';

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
${JSON.stringify(
  searchResults.map((r) => ({
    name: r.name,
    url: r.url,
    snippet: r.snippet.replace(/\s+/g, ' ').trim().slice(0, 280),
  })),
)}

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
- Keep each section body to 2-3 sentences and the WHOLE JSON under ~700 words — dense beats long.
- If the search results are sparse, rely on your own knowledge, but keep every key present with the required structure.`;
}

// ---------- 3) Design tokens + match analysis ----------

const DESIGN_TOKENS_INTERFACE = `DesignTokens TypeScript interface (fill every field):
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
  previewCopy: {
    navLinks: string[];  // 3-4 short nav labels (<= 16 chars each) appropriate for this product
    navCta: string;      // nav action, <= 24 chars
    heroHeadline: string;  // 3-8 words, specific to THIS product and audience
    heroSubhead: string;   // one sentence (<= 160 chars) speaking to the audience's core trust need
    primaryCta: string;    // <= 28 chars, the action this audience wants to take
    secondaryCta: string;  // <= 28 chars
    featureCards: [{ icon: 'sparkles' | 'shield' | 'zap' | 'check', title: string, text: string }];  // exactly 3, domain-specific
    pricing: { features: string[] };  // exactly 5 short plan bullets (<= 30 chars) for THIS product
    testimonial: { quote: string, author: string, role: string };  // realistic customer voice for THIS audience
    alerts: { success: { title: string, text: string }, warning: { title: string, text: string }, danger: { title: string, text: string } };
  };
}`;

const DESIGN_TOKENS_SCHEMA = `{
  "matchAnalysis": {
    "score": 0-100,
    "verdict": "one paragraph judging how well the logo fits this audience/purpose, referencing specific findings",
    "issues": [{ "severity": "high|medium|low", "title": "...", "detail": "..." }]  // 0-5; empty array if excellent fit
    "suggestions": [{ "title": "...", "detail": "..." }]  // 2-4 concrete logo or usage fixes; if fit is excellent, give refinement suggestions
  },
  "tokens": { ...full DesignTokens JSON schema below... }
}

${DESIGN_TOKENS_INTERFACE}`;

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
${DESIGN_CORPUS_DIGEST}
- brand.personality: 3-6 adjectives; brand.voice: one sentence describing the product voice.
- previewCopy: landing-page microcopy written FOR THIS EXACT product, domain and audience (a farming app must read like a farming app — e.g. 'Plan your season with confidence'; NEVER generic fintech/wallet copy). Ground it in the audience psychology research: the headline/subhead should address what this audience fears and wants, and CTAs should feel natural to them. featureCards texts showcase how the product builds the trust levers found in research.`;
}

// ---------- 3b) Design theme variants (research-grounded alternatives) ----------

// Compact output on purpose: the model returns a small "direction spec" per
// theme (NOT full DesignTokens JSON). Full token sets blew past the model's
// output limit, truncated mid-JSON, and made every retry fail ("Unbalanced
// JSON") — the feature looked hung for minutes. A ~300-token reply parses
// reliably and generates in seconds; the server merges the spec over the
// applied design's tokens deterministically.
export const THEMES_SYSTEM =
  'You are a world-class design director proposing distinct design-system directions. Respond with ONLY a valid JSON object — the very first characters of your reply must be {"themes": [ and the reply must end with ]}. Keep each theme object SMALL (a short direction spec, not full token JSON). No markdown fences, no commentary, no code block.';

const THEMES_SCHEMA = `{
  "themes": [
    {
      "name": "short evocative direction name (<= 24 chars), e.g. 'Trust Ledger', 'Warm Craft', 'Quiet Grid'",
      "reason": "2-3 sentences: why this direction fits the audience psychology and which specific research findings it applies",
      "score": 0-100,  // how strongly this direction matches the reviewed research; the FIRST theme must be the highest-scoring
      "primary": "#RRGGBB brand/primary color for this direction",
      "surface": "light" or "dark",  // the surface atmosphere for this direction
      "heading": "heading font family",
      "body": "body font family",
      "shape": "sharp" or "soft" or "generous"  // radius/shadow character
    }
    // exactly 3 theme objects, ordered best-first (highest research fit first)
  ]
}`;

export function buildThemesPrompt(
  project: { name: string; description?: string | null },
  audience: AudienceData,
  analysis: AnalysisData,
  research: ResearchData,
  currentTokens: DesignTokens | null,
): string {
  const current = currentTokens
    ? `CURRENT APPLIED DESIGN (baseline — its colors/typography stay unless a field overrides them):
${JSON.stringify(
      {
        brand: currentTokens.brand,
        primary: currentTokens.colors?.primary?.hex,
        heading: currentTokens.typography?.heading?.family,
        body: currentTokens.typography?.body?.family,
      },
      null,
      1,
    )}`
    : 'No design has been generated yet — the server will derive tokens from the logo palette.';

  return `Propose 3 alternative design-system DIRECTIONS for this project. Each is a compact spec (name, reason, score, primary hex, surface mode, two fonts, shape character) — the server turns each spec into full tokens by merging it over the current design.

PROJECT: "${project.name}" — ${project.description || 'no description provided'}

AUDIENCE: ${JSON.stringify(compactAudience(audience))}

LOGO PALETTE: ${JSON.stringify(analysis.palette.map((c) => ({ hex: c.hex, name: c.name })))} | styleTags: ${analysis.styleTags.join(', ') || 'unknown'} | mood: ${analysis.mood}

RESEARCH DIGEST (reviewed findings — every theme MUST apply these):
${digestResearch(research)}

${current}

${THEMES_SCHEMA}

Direction rules:
- The three directions must be MEANINGFULLY different (e.g. different primary hue family, light vs dark surface, different font pairing, different shape character), yet ALL stay true to the research: use the colorTheory findings for hue/harmony choices, respect trustFactors and commonMistakes as guardrails, take positioning cues from competitorLogos (differentiate, do not clone).
- The FIRST direction is your recommended best outcome: the safest, most research-aligned one. Its score must be the highest.
- Derive each primary from the logo palette when it serves the field's psychology; if a direction shifts away from the logo color for psychological fit, say so in its reason.
- primary must have 4.5:1 contrast against a white OR near-black surface (the server re-checks and fixes the on-primary text color).
- heading and body families MUST be chosen from this exact list: Inter, Manrope, Poppins, Space Grotesk, Sora, Outfit, IBM Plex Sans, Playfair Display, DM Serif Display, Lora, Merriweather, JetBrains Mono.
- shape guides radius + shadows: "sharp" = tight radii, crisp edges; "soft" = balanced radii, gentle shadows; "generous" = large radii, airy ambient shadows.`;
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

${DESIGN_CORPUS}

Write DESIGN.md for the project following the corpus categories EXACTLY. Required outline:

- H1 \`# DESIGN.md — ${project.name}\` then a blockquote: '> Agent-ready design system specification generated by DesignForge. Paste this file into Cursor, v0, Lovable, Claude Code, or any AI builder to produce consistent, on-brand UI.'

- ## Overview — corpus C2: thesis-first narrative (3-4 paragraphs) weaving in the brand snapshot (personality, voice), the audience psychology and the trust strategy from the research (what this audience fears, what signals make them feel safe), then **Key Characteristics:** with 6-9 concrete rules.

- ## Colors — corpus C3: H3 groups in order (### Brand & Accent → ### Surface → ### Text → ### Semantic & Borders), each color as **Evocative Name** (\`{colors.token}\` — #hex): usage sentence. Use the tokens JSON roles; upgrade generic names to evocative brand names but keep hex EXACT. State the accent discipline (how many accents, where color is forbidden). End with the full 12-role table (Token | Hex | Usage), the palette scale strip (Step 50→900 | Hex), and the primary/primaryForeground contrast ratio with its WCAG verdict.

- ## Typography — corpus C4: Google Fonts \`@import url(...)\` line for both families first, then ### Font Family narrative (exact families + fallbacks + the EXACT weights used + why the pairing fits this brand), ### Hierarchy table (| Token | Size | Weight | Line Height | Letter Spacing | Use | — rows h1→caption with real surfaces in Use), ### Principles (3-5 bullets: weight discipline, tracking philosophy, size rhythm), ### Note on Font Substitutes (open-source stand-ins + what to preserve).

- ## Layout & Responsive — corpus C5: ### Spacing System (base unit + token ladder + where each range is spent), ### Grid & Container (max widths, grid arity per breakpoint), ### Whitespace Philosophy (opinionated paragraph), ### Responsive Strategy with H4 subsections in order: #### Breakpoints (| Name | Width | Key Changes | table), #### Touch Targets (44px minimum callout with the real tap surfaces), #### Collapsing Strategy (what collapses first, what never collapses), #### Image Behavior (full-bleed vs padded, ratios, lazy-load).

- ## Elevation & Depth — corpus C6: | Level | Treatment | Use | table from Flat up, then ### Decorative Depth (what replaces shadows here, where the single allowed flourish lives).

- ## Shapes — corpus C7: ### Border Radius Scale (| Token | Value | Use | table) + name the radius language, then ### Photography Geometry.

- ## Components — corpus C8: H3 groups ### Buttons / ### Navigation / ### Inputs & Forms / ### Pills & Badges / ### Cards & Containers / ### Footer. Every component as **\`component-name\`** — one-line description + ONE spec line binding every token (background, text, type, rounded, padding, height) using brace grammar {colors.x}/{typography.x}/{rounded.x}. Include primary/secondary/outline/ghost/disabled buttons, navbar, footer, input, card, badge, alert, modal, pricing card, testimonial. States as separate entries (-active, -disabled, -focused). Add this brand's trust components (e.g. security strip, guarantees band) from trustPatterns.

- ## Voice, Motion & Imagery — tone from brand.voice; CTA style with 3 examples pulled from tokens.previewCopy (heroHeadline, primaryCta, secondaryCta) + why they fit the audience; error-message tone with 2 examples; motion spec (durations 150-300ms, easing, what may animate, prefers-reduced-motion); icon style + stroke width, illustration direction, photo treatment.

- ## Logo Usage — clear space, minimum sizes, approved backgrounds from the actual logo palette, and a do/don't pair derived from the analysis + LOGO FIT REPORT suggestions.

- ## Do's and Don'ts — corpus C9: ### Do (6-8 token-referencing bullets) / ### Don't (6-8 bullets protecting the system's discipline).

- ## Accessibility — WCAG AA minimums, focus ring spec, touch targets ≥ 44px, never color-alone state.

Rules:
- Follow corpus C10 voice rules: every claim grounded in a concrete value from the tokens/research; zero filler; zero placeholders.
- Every color MUST be a concrete hex from the tokens JSON above.
- Total ~300-450 lines of dense, specific markdown.
- Output ONLY the raw markdown file content. Do not wrap the whole file in markdown code fences.`;
}

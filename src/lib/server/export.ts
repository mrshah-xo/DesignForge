// ============================================================
// Export + serialization helpers (server only).
// Row→typed-object parsers shared by API routes, metadata JSON,
// deterministic brand-sheet SVG, the .zip export package and the
// deterministic fallback DESIGN.md template.
// ============================================================

import JSZip from 'jszip';
import type {
  Project,
  AudienceProfile,
  LogoAnalysis,
  ResearchReport,
  DesignSpec,
} from '@prisma/client';
import type {
  AnalysisData,
  AudienceData,
  DesignData,
  LogoFeedback,
  LogoIssue,
  LogoSuggestion,
  ProjectDetail,
  ProjectSummary,
  ResearchData,
  ResearchSection,
  ResearchSections,
  ResearchSource,
  CompetitorBrand,
  DesignTokens,
  PaletteColor,
} from '@/lib/types';
import type { PaletteStep } from '@/lib/types';
import { normalizeTokens } from '@/lib/server/ai';
import {
  contrastRatio,
  lightenHex,
} from '@/lib/server/logo-image';

// Prisma row aliases.
type ProjectRow = Project;
type AudienceRow = AudienceProfile;
type AnalysisRow = LogoAnalysis;
type ResearchRow = ResearchReport;
type DesignRow = DesignSpec;

// ---------- generic JSON helpers ----------

export function safeJsonParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringList(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, cap);
}

// ---------- research normalization (shared with the research route) ----------

function normalizeSection(raw: unknown, fallbackTitle: string): ResearchSection {
  const r = isPlainObject(raw) ? raw : {};
  const bullets = (Array.isArray(r.bullets) ? r.bullets : [])
    .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    .map((b) => b.trim())
    .slice(0, 12);
  return {
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : fallbackTitle,
    body: typeof r.body === 'string' ? r.body : '',
    bullets,
  };
}

function normalizeCompetitors(raw: unknown): {
  title: string;
  body: string;
  brands: CompetitorBrand[];
} {
  const r = isPlainObject(raw) ? raw : {};
  const brands = (Array.isArray(r.brands) ? r.brands : [])
    .map((b) => {
      const o = isPlainObject(b) ? b : {};
      return {
        name: typeof o.name === 'string' ? o.name.trim() : '',
        colors: typeof o.colors === 'string' ? o.colors.trim() : '',
        approach: typeof o.approach === 'string' ? o.approach.trim() : '',
      };
    })
    .filter((b) => b.name.length > 0)
    .slice(0, 8);
  return {
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'Competitor logos',
    body: typeof r.body === 'string' ? r.body : '',
    brands,
  };
}

/** Fill every missing/garbage research section with a safe fallback object. */
export function normalizeResearchSections(raw: unknown): ResearchSections {
  const r = isPlainObject(raw) ? raw : {};
  return {
    audiencePsychology: normalizeSection(r.audiencePsychology, 'Audience psychology'),
    trustFactors: normalizeSection(r.trustFactors, 'Trust factors'),
    successfulPatterns: normalizeSection(r.successfulPatterns, 'Successful patterns'),
    competitorLogos: normalizeCompetitors(r.competitorLogos),
    colorTheory: normalizeSection(r.colorTheory, 'Color theory'),
    commonMistakes: normalizeSection(r.commonMistakes, 'Common mistakes'),
  };
}

export function normalizeSources(raw: unknown): ResearchSource[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((s) => {
      const o = isPlainObject(s) ? s : {};
      return {
        name: typeof o.name === 'string' ? o.name.trim() : '',
        url: typeof o.url === 'string' ? o.url.trim() : '',
        note: typeof o.note === 'string' ? o.note.trim() : '',
      };
    })
    .filter((s) => s.name.length > 0 || s.url.length > 0)
    .slice(0, 12);
}

export function normalizeLogoFeedback(raw: unknown): LogoFeedback {
  const r = isPlainObject(raw) ? raw : {};
  const severities = ['high', 'medium', 'low'];
  const issues: LogoIssue[] = (Array.isArray(r.issues) ? r.issues : [])
    .map((i) => {
      const o = isPlainObject(i) ? i : {};
      return {
        severity: severities.includes(o.severity as string)
          ? (o.severity as LogoIssue['severity'])
          : 'medium',
        title: typeof o.title === 'string' ? o.title.trim() : '',
        detail: typeof o.detail === 'string' ? o.detail.trim() : '',
      };
    })
    .filter((i) => i.title.length > 0 || i.detail.length > 0)
    .slice(0, 5);
  const suggestions: LogoSuggestion[] = (Array.isArray(r.suggestions) ? r.suggestions : [])
    .map((s) => {
      const o = isPlainObject(s) ? s : {};
      return {
        title: typeof o.title === 'string' ? o.title.trim() : '',
        detail: typeof o.detail === 'string' ? o.detail.trim() : '',
      };
    })
    .filter((s) => s.title.length > 0 || s.detail.length > 0)
    .slice(0, 6);
  return {
    verdict: typeof r.verdict === 'string' ? r.verdict : '',
    issues,
    suggestions,
  };
}

// ---------- row → typed-object parsers ----------

export function parseAnalysisRow(row: AnalysisRow | null): AnalysisData | null {
  if (!row) return null;
  const palette = (safeJsonParse<unknown>(row.palette, []) as unknown[]).filter(
    (c): c is PaletteColor => isPlainObject(c) && typeof c.hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.hex),
  );
  return {
    palette,
    styleTags: stringList(safeJsonParse<unknown>(row.styleTags, []), 8),
    mood: row.mood ?? '',
    temperature: row.temperature ?? 'neutral',
    industry: row.industry ?? '',
    audienceGuess: row.audienceGuess ?? '',
    trustSignals: stringList(safeJsonParse<unknown>(row.trustSignals, []), 6),
    description: row.description ?? '',
  };
}

export function parseAudienceRow(row: AudienceRow | null): AudienceData | null {
  if (!row) return null;
  return {
    category: row.category as AudienceData['category'],
    categoryLabel: row.categoryLabel,
    audienceDesc: row.audienceDesc,
    platform: row.platform,
    monetization: row.monetization,
    trustNeed: row.trustNeed,
    notes: row.notes ?? '',
  };
}

export function parseResearchRow(row: ResearchRow | null): ResearchData | null {
  if (!row) return null;
  return {
    status: row.status,
    sections: normalizeResearchSections(safeJsonParse<unknown>(row.sections, {})),
    sources: normalizeSources(safeJsonParse<unknown>(row.sources, [])),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

export function parseDesignRow(row: DesignRow | null): DesignData | null {
  if (!row) return null;
  // Re-normalize so the stored spec is always a complete DesignTokens object.
  const tokens = normalizeTokens(safeJsonParse<unknown>(row.tokens, {}));
  return {
    tokens,
    markdown: row.markdown ?? '',
    matchScore: row.matchScore,
    logoFeedback: normalizeLogoFeedback(safeJsonParse<unknown>(row.logoFeedback, {})),
  };
}

export function toProjectSummary(project: ProjectRow): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    status: project.status,
    logoDataUrl: project.logoData,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function toProjectDetail(
  project: ProjectRow & {
    analysis: AnalysisRow | null;
    audience: AudienceRow | null;
    research: ResearchRow | null;
    design: DesignRow | null;
  },
): ProjectDetail {
  return {
    ...toProjectSummary(project),
    analysis: parseAnalysisRow(project.analysis),
    audience: parseAudienceRow(project.audience),
    research: parseResearchRow(project.research),
    design: parseDesignRow(project.design),
  };
}

// ---------- export artifacts ----------

export const LOGO_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** Pure base64 payload of a data URL (no "data:...;base64," prefix). */
export function logoBase64(dataUrl: string): string {
  const idx = (dataUrl ?? '').indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl ?? '';
}

export function slugifyProjectName(name: string): string {
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'designforge-project';
}

export function buildMetadataJson(
  project: ProjectRow,
  audience: AudienceRow | null,
  analysis: AnalysisRow | null,
  research: ResearchRow | null,
  design: DesignRow,
): Record<string, unknown> {
  const analysisData = parseAnalysisRow(analysis);
  const researchData = parseResearchRow(research);
  return {
    tool: 'DesignForge',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    projectName: project.name,
    projectDescription: project.description ?? '',
    category: audience?.category ?? null,
    categoryLabel: audience?.categoryLabel ?? null,
    audienceDesc: audience?.audienceDesc ?? null,
    platform: audience?.platform ?? null,
    monetization: audience?.monetization ?? null,
    trustNeed: audience?.trustNeed ?? null,
    matchScore: design.matchScore,
    logoStyleTags: analysisData?.styleTags ?? [],
    logoMood: analysisData?.mood ?? null,
    researchStatus: researchData?.status ?? null,
    sourcesCount: researchData?.sources.length ?? 0,
  };
}

// ---------- brand sheet SVG ----------

function escapeXml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fontStack(family: string): string {
  const serif = ['Playfair Display', 'DM Serif Display', 'Lora', 'Merriweather'];
  if (family === 'JetBrains Mono') return `${family}, monospace`;
  if (serif.includes(family)) return `${family}, serif`;
  return `${family}, sans-serif`;
}

function radiusToPx(value: string, cap = 28): number {
  const match = /([\d.]+)\s*(rem|px)?/.exec(value ?? '');
  if (!match) return 8;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n)) return 8;
  const px = match[2] === 'rem' ? n * 16 : n;
  return Math.max(0, Math.min(cap, px));
}

const ROLE_ORDER: Array<keyof DesignTokens['colors']> = [
  'primary',
  'primaryForeground',
  'secondary',
  'accent',
  'background',
  'foreground',
  'muted',
  'mutedForeground',
  'border',
  'success',
  'warning',
  'danger',
];

/**
 * Deterministic ~1200x860 SVG brand sheet: header band, 12 role swatches,
 * palette scale strip, typography samples and radius/shadow demo boxes.
 */
export function buildBrandSheetSvg(tokens: DesignTokens): string {
  const { colors, brand, paletteScale, typography, radius } = tokens;
  const primary = colors.primary.hex;
  const onPrimary = colors.primaryForeground.hex;
  const heading = fontStack(typography.heading.family);
  const body = fontStack(typography.body.family);
  const brandName = brand.name || 'Untitled Brand';

  const parts: string[] = [];
  parts.push(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="880" viewBox="0 0 1200 880">',
  );
  parts.push('<defs>');
  parts.push(
    '<filter id="dfShadowSm" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.10"/></filter>',
  );
  parts.push(
    '<filter id="dfShadowMd" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.14"/></filter>',
  );
  parts.push(
    '<filter id="dfShadowLg" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="0.18"/></filter>',
  );
  parts.push('</defs>');
  parts.push('<rect width="1200" height="880" fill="#FFFFFF"/>');

  // ---- header band ----
  parts.push('<rect width="1200" height="130" fill="' + primary + '"/>');
  parts.push(
    '<text x="48" y="66" font-family="' + heading + '" font-size="44" font-weight="700" fill="' + onPrimary + '">' +
      escapeXml(brandName) +
      '</text>',
  );
  // personality chips
  let chipX = 48;
  for (const p of brand.personality.slice(0, 6)) {
    const label = escapeXml(p);
    const w = Math.round(p.length * 6.8 + 26);
    parts.push(
      '<rect x="' + chipX + '" y="82" width="' + w + '" height="26" rx="13" fill="none" stroke="' + onPrimary + '" stroke-opacity="0.55"/>',
    );
    parts.push(
      '<text x="' + (chipX + w / 2) + '" y="99" text-anchor="middle" font-family="' + body + '" font-size="11" fill="' + onPrimary + '">' +
        label +
        '</text>',
    );
    chipX += w + 10;
  }
  if (brand.voice) {
    parts.push(
      '<text x="1152" y="99" text-anchor="end" font-family="' + body + '" font-size="12" font-style="italic" fill="' + onPrimary + '" fill-opacity="0.85">' +
        escapeXml(brand.voice.slice(0, 60)) +
        '</text>',
    );
  }

  // section label helper
  const sectionLabel = (y: number, text: string) => {
    parts.push(
      '<text x="48" y="' + y + '" font-family="' + body + '" font-size="12" font-weight="600" letter-spacing="2.5" fill="#71717A">' +
        escapeXml(text.toUpperCase()) +
        '</text>',
    );
  };

  // ---- 12 role swatches ----
  sectionLabel(176, 'Color roles');
  const colW = 258;
  const colGap = 24;
  const rows = [192, 318, 444];
  ROLE_ORDER.forEach((role, i) => {
    const token = colors[role];
    const x = 48 + (i % 4) * (colW + colGap);
    const y = rows[Math.floor(i / 4)];
    parts.push(
      '<rect x="' + x + '" y="' + y + '" width="' + colW + '" height="72" rx="10" fill="' + token.hex + '" stroke="#E4E4E7"/>',
    );
    parts.push(
      '<text x="' + x + '" y="' + (y + 92) + '" font-family="' + body + '" font-size="12.5" font-weight="600" fill="#18181B">' +
        escapeXml(role) +
        '</text>',
    );
    parts.push(
      '<text x="' + x + '" y="' + (y + 110) + '" font-family="' + body + '" font-size="11.5" fill="#71717A">' +
        escapeXml(token.hex + ' · ' + token.name) +
        '</text>',
    );
  });

  // ---- palette scale strip ----
  sectionLabel(604, 'Palette scale');
  paletteScale.slice(0, 12).forEach((step: PaletteStep, i: number) => {
    const x = 48 + i * 111;
    parts.push(
      '<rect x="' + x + '" y="618" width="103" height="44" rx="6" fill="' + step.hex + '" stroke="#E4E4E7"/>',
    );
    parts.push(
      '<text x="' + (x + 51.5) + '" y="680" text-anchor="middle" font-family="' + body + '" font-size="11" fill="#71717A">' +
        escapeXml(step.step) +
        '</text>',
    );
  });

  // ---- typography + radius/shadow demos ----
  sectionLabel(712, 'Typography · radius · shadows');
  parts.push(
    '<text x="48" y="796" font-family="' + heading + '" font-size="64" font-weight="700" fill="' + primary + '">Aa</text>',
  );
  parts.push(
    '<text x="190" y="756" font-family="' + heading + '" font-size="20" font-weight="600" fill="#18181B">' +
      escapeXml('The quick brown fox jumps over the lazy dog') +
      '</text>',
  );
  parts.push(
    '<text x="190" y="782" font-family="' + body + '" font-size="15" fill="#52525B">' +
      escapeXml(
        'Body text set in ' + typography.body.family + ' at ' + typography.scale.body + ' — clear, readable and trustworthy.',
      ) +
      '</text>',
  );
  parts.push(
    '<text x="190" y="804" font-family="' + body + '" font-size="11" fill="#71717A">' +
      escapeXml(
        'h1 ' +
          typography.scale.h1 +
          ' · h2 ' +
          typography.scale.h2 +
          ' · h3 ' +
          typography.scale.h3 +
          ' · h4 ' +
          typography.scale.h4 +
          ' · body ' +
          typography.scale.body +
          ' · small ' +
          typography.scale.small +
          ' · caption ' +
          typography.scale.caption,
      ) +
      '</text>',
  );

  const demoBoxes: Array<{ label: string; rx: number; filter: string }> = [
    { label: 'sm · ' + radius.sm, rx: radiusToPx(radius.sm), filter: 'dfShadowSm' },
    { label: 'md · ' + radius.md, rx: radiusToPx(radius.md), filter: 'dfShadowMd' },
    { label: 'lg · ' + radius.lg, rx: radiusToPx(radius.lg), filter: 'dfShadowLg' },
  ];
  demoBoxes.forEach((box, i) => {
    const x = 620 + i * 150;
    parts.push(
      '<rect x="' + x + '" y="736" width="110" height="56" rx="' + box.rx + '" fill="' + colors.background.hex + '" stroke="' + colors.border.hex + '" filter="url(#' + box.filter + ')"/>',
    );
    parts.push(
      '<text x="' + (x + 55) + '" y="812" text-anchor="middle" font-family="' + body + '" font-size="10.5" fill="#71717A">' +
        escapeXml(box.label) +
        '</text>',
    );
  });

  // ---- footer ----
  parts.push(
    '<text x="48" y="850" font-family="' + body + '" font-size="10.5" fill="#A1A1AA">Generated by DesignForge · ' +
      escapeXml(new Date().toISOString().slice(0, 10)) +
      '</text>',
  );
  parts.push('</svg>');
  return parts.join('\n');
}

// ---------- .zip export package ----------

export async function buildExportZip(
  project: ProjectRow,
  design: DesignRow,
  audience: AudienceRow | null,
  analysis: AnalysisRow | null,
  research: ResearchRow | null,
): Promise<Buffer> {
  const tokens = parseDesignRow(design)?.tokens ?? normalizeTokens(null);
  const zip = new JSZip();
  zip.file('DESIGN.md', design.markdown ?? '');
  zip.file('tokens.json', JSON.stringify(tokens, null, 2));
  zip.file(
    'metadata.json',
    JSON.stringify(buildMetadataJson(project, audience, analysis, research, design), null, 2),
  );
  const ext = LOGO_EXT_BY_MIME[project.logoMime] ?? 'png';
  zip.file(`logo.${ext}`, Buffer.from(logoBase64(project.logoData), 'base64'));
  zip.file('brand-sheet.svg', buildBrandSheetSvg(tokens));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ---------- deterministic fallback DESIGN.md ----------

function mdPaletteTable(tokens: DesignTokens): string[] {
  const lines: string[] = ['| Token | Hex | Usage |', '| --- | --- | --- |'];
  for (const role of ROLE_ORDER) {
    const t = tokens.colors[role];
    lines.push(`| ${role} | ${t.hex} | ${t.usage} |`);
  }
  return lines;
}

function googleFontsImport(tokens: DesignTokens): string {
  const fam = (f: string, weights: number[]) =>
    `family=${f.replace(/ /g, '+')}:wght@${[...new Set(weights)].sort((a, b) => a - b).join(';')}`;
  return `@import url('https://fonts.googleapis.com/css2?${fam(
    tokens.typography.heading.family,
    tokens.typography.heading.weights,
  )}&${fam(tokens.typography.body.family, tokens.typography.body.weights)}&display=swap');`;
}

/**
 * Deterministic DESIGN.md template used when the markdown LLM call fails —
 * the design request must never fail because of the markdown step.
 */
export function buildFallbackMarkdown(
  project: { name: string; description?: string | null },
  audience: AudienceData | null,
  analysis: AnalysisData | null,
  research: ResearchData | null,
  tokens: DesignTokens,
  matchScore: number,
): string {
  const { colors, brand, typography, radius, shadows } = tokens;
  const trustBullets =
    research?.sections.trustFactors.bullets.slice(0, 6) ??
    [];
  const psychBullets = research?.sections.audiencePsychology.bullets.slice(0, 6) ?? [];
  const trustLines = trustBullets.length
    ? trustBullets.map((b) => `- ${b}`)
    : [
        `- Lead with the strongest trust signal above the fold (audience trust need: ${audience?.trustNeed ?? 'medium'}).`,
        '- Use concrete, specific microcopy instead of vague claims.',
        '- Show real social proof near decision points.',
      ];
  const psychLines = psychBullets.length
    ? psychBullets.map((b) => `- ${b}`)
    : [`- Audience: ${audience?.audienceDesc ?? 'general users'} on ${audience?.platform ?? 'web'} platforms.`];

  const contrast = contrastRatio(colors.primary.hex, colors.primaryForeground.hex).toFixed(2);

  const c = (label: string, hex: string) => `${label} \`${hex}\``;

  return `# DESIGN.md — ${project.name}

> Agent-ready design system specification generated by DesignForge. Paste this file into Cursor, v0, Lovable, Claude Code, or any AI builder to produce consistent, on-brand UI.

## 1. Brand snapshot

- **Brand name:** ${brand.name || project.name}
- **Personality:** ${brand.personality.length ? brand.personality.join(', ') : 'trustworthy, modern, clear'}
- **Voice:** ${brand.voice || 'Clear, confident and human.'}
- **Logo fit score:** ${matchScore}/100
- **Logo style tags:** ${analysis?.styleTags.join(', ') || 'n/a'}
- **Mood:** ${analysis?.mood || 'Neutral and modern'}

## 2. Audience psychology & trust strategy

${psychLines.join('\n')}

Trust levers (ordered by impact):

${trustLines.join('\n')}

## 3. Color system

${mdPaletteTable(tokens).join('\n')}

Palette scale:

| Step | Hex |
| --- | --- |
${tokens.paletteScale.map((s) => `| ${s.step} | ${s.hex} |`).join('\n')}

> Primary on primaryForeground contrast ratio: **${contrast}:1** (WCAG AA target ≥ 4.5:1).

## 4. Typography

\`\`css
${googleFontsImport(tokens)}
\`\`

- **Headings:** ${typography.heading.family}, weights ${typography.heading.weights.join(', ')}, letter-spacing ${typography.heading.letterSpacing}
- **Body:** ${typography.body.family}, weights ${typography.body.weights.join(', ')}, line-height ${typography.body.lineHeight}

| Token | Size |
| --- | --- |
| h1 | ${typography.scale.h1} |
| h2 | ${typography.scale.h2} |
| h3 | ${typography.scale.h3} |
| h4 | ${typography.scale.h4} |
| body | ${typography.scale.body} |
| small | ${typography.scale.small} |
| caption | ${typography.scale.caption} |

Usage rules: one H1 per view; headings in the heading family only; body text never below ${typography.scale.small}; captions use mutedForeground.

## 5. Layout & spacing

- 12-column grid, 24px gutters, 4px base spacing scale (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96).
- Section rhythm: 96px between major sections on desktop, 64px on mobile.
- Containers: max-width 1200px, side padding 24px; forms max-width 480px; reading content max-width 720px.

## 6. Component specifications

- **Button — primary:** background ${c('primary', colors.primary.hex)}, text ${c('primaryForeground', colors.primaryForeground.hex)}, padding 12px 20px, radius ${radius.md}, font body/${typography.scale.small}; hover: darken background 8%; focus: 2px ${c('accent', colors.accent.hex)} outline offset 2px.
- **Button — secondary (${tokens.buttons.secondary}):** background ${c('secondary', colors.secondary.hex)}, text ${c('primary', colors.primary.hex)}, same metrics as primary.
- **Button — outline:** transparent background, 1px ${c('border', colors.border.hex)} border, text ${c('foreground', colors.foreground.hex)}; hover: background ${c('muted', colors.muted.hex)}.
- **Button — ghost:** transparent background and border, text ${c('primary', colors.primary.hex)}; hover: background ${c('muted', colors.muted.hex)}.
- **Button — disabled:** background ${c('muted', colors.muted.hex)}, text ${c('mutedForeground', colors.mutedForeground.hex)}, no hover state, cursor not-allowed.
- **Input:** 1px border ${colors.border.hex}, radius ${radius.sm}, padding 10px 12px, background ${colors.background.hex}; focus: border ${colors.primary.hex} + 3px ring ${lightenHex(colors.primary.hex, 0.75)}; error: border ${colors.danger.hex}.
- **Card:** background ${colors.background.hex}, 1px border ${colors.border.hex}, radius ${radius.lg}, shadow ${shadows.sm}, padding 24px.
- **Navbar:** height 64px, background ${colors.background.hex}, bottom border ${colors.border.hex}; logo left, links ${c('foreground', colors.foreground.hex)}, CTA right (primary button).
- **Footer:** background ${c('muted', colors.muted.hex)}, text ${c('mutedForeground', colors.mutedForeground.hex)}, padding 48px 24px, 12px link spacing.
- **Badge:** radius ${radius.full}, padding 4px 10px, font caption; variants success/warning/danger at 12% tint backgrounds.
- **Alert:** radius ${radius.md}, padding 16px, left accent bar 4px (success ${colors.success.hex} / warning ${colors.warning.hex} / danger ${colors.danger.hex}), background 8% tint of the accent.
- **Modal:** overlay rgb(0 0 0 / 0.5), panel radius ${radius.lg}, shadow ${shadows.lg}, padding 24px, max-width 560px.
- **Pricing card:** card base + highlighted plan border ${colors.primary.hex}, price in heading family ${typography.scale.h2}, CTA full-width primary button.
- **Testimonial:** card base, quote in body family ${typography.scale.body}, author in caption with mutedForeground, avatar 40px circle.

## 7. Imagery & iconography

- Icons: outline style, 1.5–2px stroke, corner style matching radius tokens (${radius.md}).
- Illustration: flat, ${analysis?.styleTags.includes('playful') ? 'friendly and playful' : 'clean and geometric'}, palette colors only.
- Photos: natural light, subtle ${radius.md} rounding, no heavy filters; duotone overlay with ${colors.primary.hex} at 10% for brand moments.

## 8. Motion

- Durations: 150–300ms; entrances 250ms, exits 150ms, hover/focus 150ms.
- Easing: ease-out for entrances, ease-in for exits, ease-in-out for transforms.
- Only animate opacity, transform and color; respect \`prefers-reduced-motion\`.

## 9. Voice & microcopy

- Tone: ${brand.voice || 'clear, confident and human'}.
- CTA style: specific verbs with outcomes. Examples: "Get started free", "See my {result}", "Continue to payment".
- Error tone: plain, blame-free, actionable. Examples: "That email doesn't look right — try name@company.com", "Payment didn't go through. No money was taken — try another card."

## 10. Accessibility & contrast

- Body text ≥ 4.5:1 contrast; large text and UI edges ≥ 3:1 (WCAG AA minimums).
- Focus ring: 2px ${colors.primary.hex} outline with 2px offset, visible on all interactive elements.
- Touch targets ≥ 44px; never rely on color alone to convey state.

## 11. Logo usage notes

- Clear space: keep padding equal to 50% of the logo height on all sides.
- Minimum sizes: 24px icon height, 96px full-logo width.
- Approved backgrounds: ${analysis?.palette.map((p) => p.hex).slice(0, 4).join(', ') || colors.background.hex} and ${colors.primary.hex}.
- Do: use the logo on white or ${colors.primary.hex}; keep the original aspect ratio.
- Don't: recolor, rotate, stretch or place on busy imagery.
${(analysis && matchScore < 70) ? '- Note: check the logo fit report for suggested usage adjustments before launch.' : ''}

## 12. Do / Don't summary

| Do | Don't |
| --- | --- |
| Use ${colors.primary.hex} for primary actions only | Use ${colors.primary.hex} for large text blocks |
| Keep 4px spacing rhythm | Mix arbitrary margins (13px, 27px) |
| Show trust signals near money/data moments | Hide security or pricing details |
| Use ${typography.heading.family} for headings, ${typography.body.family} for body | Use more than two font families |
| Test every surface at AA contrast | Ship light-gray text on white |
`;
}

// ============================================================
// "Want a prompt?" — research review helpers.
//
// Step 4 shows an AI-written research report the user is expected
// to review and fix by hand. That takes time, so — like the brief
// flow — the user can copy a generated prompt into their coding
// agent (ChatGPT, Claude, Gemini...). The agent critiques and
// rewrites the report and prints a DESIGNFORGE_RESEARCH block;
// the user pastes that reply back into DesignForge and the
// sections / competitor brands / sources update automatically,
// then save to the project.
//
// Pure functions only — safe for both client and server use.
// ============================================================

import type {
  CompetitorBrand,
  ResearchSection,
  ResearchSections,
  ResearchSource,
} from '@/lib/types';

// ---------- Block markers ----------

export const RESEARCH_BLOCK_START = '<<<DESIGNFORGE_RESEARCH>>>';
export const RESEARCH_BLOCK_END = '<<<END_DESIGNFORGE_RESEARCH>>>';

const BLOCK_RE =
  /<<<\s*DESIGNFORGE_RESEARCH\s*>>>([\s\S]*?)<<<\s*END_DESIGNFORGE_RESEARCH\s*>>>/i;

/** Max chars accepted for a pasted agent reply (generous; research replies are long). */
export const PARSE_RESEARCH_MAX_CHARS = 60000;

// ---------- Section metadata (single source of truth) ----------

export type ResearchSectionKey = keyof ResearchSections;

export interface ResearchSectionMeta {
  key: ResearchSectionKey;
  /** Canonical key used in the agent OUTPUT PATTERN (e.g. TRUST_FACTORS). */
  code: string;
  /** Human label for toasts. */
  label: string;
  /** What the section should contain (used in the prompt). */
  blurb: string;
  /** Normalized (letters-only, uppercase) aliases accepted in pasted replies. */
  aliases: string[];
}

export const RESEARCH_SECTIONS: ResearchSectionMeta[] = [
  {
    key: 'audiencePsychology',
    code: 'AUDIENCE_PSYCHOLOGY',
    label: 'audience psychology',
    blurb: 'what motivates, worries and convinces this exact audience',
    aliases: ['AUDIENCEPSYCHOLOGY', 'PSYCHOLOGY', 'AUDIENCE'],
  },
  {
    key: 'trustFactors',
    code: 'TRUST_FACTORS',
    label: 'trust factors',
    blurb: 'the signals that make this audience believe — and pay',
    aliases: ['TRUSTFACTORS', 'TRUST'],
  },
  {
    key: 'successfulPatterns',
    code: 'SUCCESSFUL_PATTERNS',
    label: 'successful patterns',
    blurb: 'visual patterns proven to work with audiences like this',
    aliases: ['SUCCESSFULPATTERNS', 'PATTERNS'],
  },
  {
    key: 'competitorLogos',
    code: 'COMPETITOR_LOGOS',
    label: 'competitor logos',
    blurb: 'how similar brands look, plus 3-5 named competitor brands',
    aliases: ['COMPETITORLOGOS', 'COMPETITORS'],
  },
  {
    key: 'colorTheory',
    code: 'COLOR_THEORY',
    label: 'color theory',
    blurb: 'color psychology applied to this category and audience',
    aliases: ['COLORTHEORY', 'COLOR', 'COLOURTHEORY', 'COLOUR'],
  },
  {
    key: 'commonMistakes',
    code: 'COMMON_MISTAKES',
    label: 'common mistakes',
    blurb: 'design choices that erode trust with this audience',
    aliases: ['COMMONMISTAKES', 'MISTAKES'],
  },
];

const SECTION_BY_ALIAS: Record<string, ResearchSectionKey> = (() => {
  const map: Record<string, ResearchSectionKey> = {};
  for (const meta of RESEARCH_SECTIONS) {
    for (const alias of meta.aliases) map[alias] = meta.key;
  }
  return map;
})();

// ---------- Prompt context ----------

export interface ResearchPromptContext {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  audienceDesc?: string | null;
  platform?: string | null;
  monetization?: string | null;
  trustNeed?: string | null;
  notes?: string | null;
  /** The current report the agent should critique/fix (null when nothing exists yet). */
  sections?: ResearchSections | null;
  /** What the user wants their agent to focus on fixing. */
  extraInstructions?: string | null;
}

// ============================================================
// Prompt builder
// ============================================================

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/[*>`]+/g, '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Compact one-line-per-section summary of the current report for the prompt. */
export function buildReportSummary(sections: ResearchSections): string[] {
  const lines: string[] = [];
  for (const meta of RESEARCH_SECTIONS) {
    if (meta.key === 'competitorLogos') {
      const comp = sections.competitorLogos;
      const bits: string[] = [];
      if (comp.title?.trim()) bits.push(`Title: ${cleanText(comp.title)}`);
      if (comp.body?.trim()) bits.push(`Summary: ${truncate(cleanText(comp.body), 300)}`);
      const brands = comp.brands.map((b) => b.name?.trim()).filter(Boolean) as string[];
      if (brands.length) bits.push(`Brands: ${brands.join(', ')}`);
      if (bits.length) lines.push(`[${meta.code}] ${bits.join(' — ')}`);
      continue;
    }
    const s: ResearchSection = sections[meta.key as Exclude<ResearchSectionKey, 'competitorLogos'>];
    const bits: string[] = [];
    if (s.title?.trim()) bits.push(`Title: ${cleanText(s.title)}`);
    if (s.body?.trim()) bits.push(`Body: ${truncate(cleanText(s.body), 300)}`);
    const bullets = (s.bullets ?? []).map((b) => b?.trim()).filter(Boolean) as string[];
    if (bullets.length) bits.push(`Points: ${truncate(bullets.join(' | '), 400)}`);
    if (bits.length) lines.push(`[${meta.code}] ${bits.join(' — ')}`);
  }
  return lines;
}

/** Build the full prompt the user copies into their coding agent. */
export function buildResearchPrompt(ctx: ResearchPromptContext): string {
  const contextLines: string[] = [];
  const name = cleanText(ctx.name);
  const description = cleanText(ctx.description);
  if (name) contextLines.push(`- Project: ${name}${description ? ` — ${description}` : ''}`);
  if (ctx.category && cleanText(ctx.category)) contextLines.push(`- Category: ${cleanText(ctx.category)}`);
  if (ctx.audienceDesc && cleanText(ctx.audienceDesc)) contextLines.push(`- Audience: ${cleanText(ctx.audienceDesc)}`);
  if (ctx.platform && cleanText(ctx.platform)) contextLines.push(`- Platform: ${cleanText(ctx.platform)}`);
  if (ctx.monetization && cleanText(ctx.monetization)) contextLines.push(`- Monetization: ${cleanText(ctx.monetization)}`);
  if (ctx.trustNeed && cleanText(ctx.trustNeed)) contextLines.push(`- Trust need: ${cleanText(ctx.trustNeed)}`);
  const notes = cleanText(ctx.notes);
  if (notes && notes.toLowerCase() !== 'none') contextLines.push(`- Notes: ${notes}`);

  const extra = cleanText(ctx.extraInstructions);
  const summary = ctx.sections ? buildReportSummary(ctx.sections) : [];
  const hasReport = summary.length > 0;

  const head = `You are reviewing the audience research report for DesignForge, a tool that turns a logo plus brand info into a complete design system. I am pasting this into you, my coding agent, because you already know this product and the people it is for.

Answer in ONE single message. Do NOT interview me. Do NOT ask questions. Do NOT split the answer across messages. Critique the current report (if any), fix what is weak, generic or wrong, keep what is already good, and return the corrected report in the exact block below.`;

  const parts: string[] = [head];

  if (contextLines.length > 0) {
    parts.push(`PROJECT CONTEXT\n${contextLines.join('\n')}`);
  }

  if (extra) {
    parts.push(`EXTRA INSTRUCTIONS FROM ME (follow these first)\n${extra}`);
  }

  if (hasReport) {
    parts.push(`CURRENT REPORT (keep what is good, fix what is weak or generic)\n${summary.join('\n')}`);
  } else {
    parts.push('There is no report yet — write the complete report yourself from the project context above.');
  }

  const explainer = RESEARCH_SECTIONS.map(
    (meta, i) => `${i + 1}. ${meta.code} — ${meta.blurb}`,
  ).join('\n');
  parts.push(`THE SIX SECTIONS\n${explainer}`);

  parts.push(`OUTPUT PATTERN — your reply must be EXACTLY this block, nothing before it and nothing after it:

${RESEARCH_BLOCK_START}
AUDIENCE_PSYCHOLOGY_TITLE: <one line>
AUDIENCE_PSYCHOLOGY_BODY: <2-4 sentences on one line>
AUDIENCE_PSYCHOLOGY_POINTS:
- <specific, concrete insight>
- <specific, concrete insight>
- <specific, concrete insight>
TRUST_FACTORS_TITLE: <one line>
TRUST_FACTORS_BODY: <2-4 sentences on one line>
TRUST_FACTORS_POINTS:
- <specific, concrete insight>
- <specific, concrete insight>
SUCCESSFUL_PATTERNS_TITLE: <one line>
SUCCESSFUL_PATTERNS_BODY: <2-4 sentences on one line>
SUCCESSFUL_PATTERNS_POINTS:
- <specific, concrete insight>
- <specific, concrete insight>
COMPETITOR_LOGOS_TITLE: <one line>
COMPETITOR_LOGOS_SUMMARY: <2-3 sentences on one line>
BRANDS:
- <Brand> | <colors it uses> | <visual approach in one phrase>
- <Brand> | <colors it uses> | <visual approach in one phrase>
- <Brand> | <colors it uses> | <visual approach in one phrase>
COLOR_THEORY_TITLE: <one line>
COLOR_THEORY_BODY: <2-4 sentences on one line>
COLOR_THEORY_POINTS:
- <specific, concrete insight>
- <specific, concrete insight>
COMMON_MISTAKES_TITLE: <one line>
COMMON_MISTAKES_BODY: <2-4 sentences on one line>
COMMON_MISTAKES_POINTS:
- <specific, concrete insight>
- <specific, concrete insight>
SOURCES:
- <Source name> | <https://url> | <what it supports>
- <Source name> | <https://url> | <what it supports>
${RESEARCH_BLOCK_END}`);

  parts.push(`RULES
- Keep every _TITLE / _BODY / _SUMMARY value on ONE line (long is fine). POINTS, BRANDS and SOURCES are headers; put each item on its own "- " line.
- 3-5 points per section, 3-5 brands, 2-5 sources. Brand and source items separate their parts with " | ".
- Only include sections you actually fixed or wrote; unchanged sections can be left out and will be kept as-is.
- Write like a design researcher for THIS exact audience: name concrete UI patterns, colors and trust signals — no generic filler.`);

  return parts.join('\n\n');
}

// ============================================================
// Parser
// ============================================================

export interface ParsedResearchSection {
  title: string | null;
  body: string | null;
  bullets: string[] | null;
}

export interface ParsedCompetitorLogos {
  title: string | null;
  body: string | null;
  brands: CompetitorBrand[] | null;
}

export interface ParsedResearch {
  sections: {
    audiencePsychology: ParsedResearchSection | null;
    trustFactors: ParsedResearchSection | null;
    successfulPatterns: ParsedResearchSection | null;
    competitorLogos: ParsedCompetitorLogos | null;
    colorTheory: ParsedResearchSection | null;
    commonMistakes: ParsedResearchSection | null;
  };
  sources: ResearchSource[] | null;
  /** Human labels of what was recognized (for toasts). */
  found: string[];
}

// ---------- Limits (mirroring the server normalizers) ----------

const TITLE_MAX = 140;
const BODY_MAX = 1500;
const BULLET_MAX = 300;
const BULLETS_MAX = 12;
const BRANDS_MAX = 8;
const SOURCES_MAX = 12;
const BRAND_NAME_MAX = 80;
const BRAND_COLORS_MAX = 160;
const BRAND_APPROACH_MAX = 400;
const SOURCE_NAME_MAX = 160;
const SOURCE_URL_MAX = 600;
const SOURCE_NOTE_MAX = 300;

function clamp(value: string, max: number): string {
  return value.trim().slice(0, max).trim();
}

function cleanValue(value: string): string {
  return value.replace(/[*>`]+/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- Key lookup ----------

type ListField = 'points' | 'brands' | 'sources';
type SectionField = 'title' | 'body' | ListField;

interface KeyTarget {
  section: ResearchSectionKey | null; // null = project-level list (sources)
  field: SectionField;
}

const FIELD_SUFFIXES: Array<{ names: string[]; field: SectionField }> = [
  { names: ['TITLE', 'HEADING', 'HEADLINE'], field: 'title' },
  { names: ['BODY', 'SUMMARY', 'DESCRIPTION', 'TEXT', 'ANALYSIS'], field: 'body' },
  { names: ['POINTS', 'KEYPOINTS', 'KEYPOINT', 'BULLETS', 'TAKEAWAYS', 'INSIGHTS'], field: 'points' },
  { names: ['BRANDS', 'BRAND', 'COMPETITORBRANDS'], field: 'brands' },
  { names: ['SOURCES', 'SOURCE', 'REFERENCES', 'LINKS'], field: 'sources' },
];

const KEY_LOOKUP: Record<string, KeyTarget> = (() => {
  const map: Record<string, KeyTarget> = {};
  for (const meta of RESEARCH_SECTIONS) {
    for (const name of meta.aliases) {
      for (const suffix of FIELD_SUFFIXES) {
        for (const fname of suffix.names) {
          map[`${name}${fname}`] = { section: meta.key, field: suffix.field };
        }
      }
    }
  }
  // Project-level list headers (no section prefix).
  map['BRANDS'] = { section: 'competitorLogos', field: 'brands' };
  map['BRAND'] = { section: 'competitorLogos', field: 'brands' };
  map['SOURCES'] = { section: null, field: 'sources' };
  map['SOURCE'] = { section: null, field: 'sources' };
  map['REFERENCES'] = { section: null, field: 'sources' };
  return map;
})();

// ---------- Collect state ----------

interface SectionAcc {
  title?: string;
  body?: string;
  bullets: string[];
}

interface CollectState {
  sections: Partial<Record<ResearchSectionKey, SectionAcc>>;
  brands: CompetitorBrand[];
  sources: ResearchSource[];
  openList: { field: ListField; section: ResearchSectionKey | null } | null;
}

function newCollectState(): CollectState {
  return { sections: {}, brands: [], sources: [], openList: null };
}

function sectionAcc(c: CollectState, key: ResearchSectionKey): SectionAcc {
  let acc = c.sections[key];
  if (!acc) {
    acc = { bullets: [] };
    c.sections[key] = acc;
  }
  return acc;
}

function sectionHasContent(c: CollectState, key: ResearchSectionKey): boolean {
  const acc = c.sections[key];
  if (!acc) return false;
  return Boolean(acc.title?.trim() || acc.body?.trim() || acc.bullets.length > 0);
}

function hasAnything(c: CollectState): boolean {
  if (c.brands.length > 0 || c.sources.length > 0) return true;
  return RESEARCH_SECTIONS.some((meta) => sectionHasContent(c, meta.key));
}

// ---------- Item parsers ----------

function looksLikeUrl(value: string): boolean {
  if (/^(https?:\/\/|www\.)/i.test(value)) return true;
  if (value.includes(' ')) return false;
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value);
}

function parseBrandItem(raw: string): CompetitorBrand | null {
  const parts = raw.split('|').map((p) => cleanValue(p));
  const name = parts[0] ?? '';
  if (!name) return null;
  return {
    name: clamp(name, BRAND_NAME_MAX),
    colors: clamp(parts[1] ?? '', BRAND_COLORS_MAX),
    approach: clamp(parts.slice(2).join(' | '), BRAND_APPROACH_MAX),
  };
}

function parseSourceItem(raw: string): ResearchSource | null {
  const parts = raw.split('|').map((p) => cleanValue(p));
  const first = parts[0] ?? '';
  if (!first) return null;
  if (parts.length >= 2 && looksLikeUrl(parts[0]!)) {
    // URL-first style: "- https://… | Name | note"
    const name = parts[1] && !looksLikeUrl(parts[1]!) ? parts[1]! : first;
    return {
      name: clamp(name, SOURCE_NAME_MAX),
      url: clamp(first, SOURCE_URL_MAX),
      note: clamp(parts.slice(2).join(' | '), SOURCE_NOTE_MAX),
    };
  }
  if (parts.length >= 3) {
    return {
      name: clamp(first, SOURCE_NAME_MAX),
      url: clamp(parts[1] ?? '', SOURCE_URL_MAX),
      note: clamp(parts.slice(2).join(' | '), SOURCE_NOTE_MAX),
    };
  }
  if (parts.length === 2) {
    const second = parts[1] ?? '';
    if (looksLikeUrl(second)) {
      return { name: clamp(first, SOURCE_NAME_MAX), url: clamp(second, SOURCE_URL_MAX), note: '' };
    }
    return { name: clamp(first, SOURCE_NAME_MAX), url: '', note: clamp(second, SOURCE_NOTE_MAX) };
  }
  return { name: clamp(first, SOURCE_NAME_MAX), url: '', note: '' };
}

function pushBullet(c: CollectState, section: ResearchSectionKey | null, raw: string): void {
  if (!section || section === 'competitorLogos') return; // competitor bullets are not a thing
  const acc = sectionAcc(c, section);
  const item = clamp(cleanValue(raw), BULLET_MAX);
  if (!item) return;
  if (acc.bullets.some((b) => b.toLowerCase() === item.toLowerCase())) return; // dedupe
  if (acc.bullets.length >= BULLETS_MAX) return;
  acc.bullets.push(item);
}

function pushBrand(c: CollectState, raw: string): void {
  if (c.brands.length >= BRANDS_MAX) return;
  const brand = parseBrandItem(raw);
  if (!brand) return;
  if (c.brands.some((b) => b.name.toLowerCase() === brand.name.toLowerCase())) return;
  c.brands.push(brand);
}

function pushSource(c: CollectState, raw: string): void {
  if (c.sources.length >= SOURCES_MAX) return;
  const source = parseSourceItem(raw);
  if (!source) return;
  c.sources.push(source);
}

function pushListItem(c: CollectState, raw: string): void {
  const list = c.openList;
  if (!list) return;
  if (list.field === 'points') pushBullet(c, list.section, raw);
  else if (list.field === 'brands') pushBrand(c, raw);
  else pushSource(c, raw);
}

/** Apply a recognized `KEY: value` line. Empty values on list fields open a list. */
function applyKeyTarget(c: CollectState, target: KeyTarget, rawValue: string): void {
  c.openList = null;

  if (target.field === 'title' || target.field === 'body') {
    if (!target.section) return;
    const value = cleanValue(rawValue);
    if (!value) return;
    const acc = sectionAcc(c, target.section);
    if (target.field === 'title') acc.title = clamp(value, TITLE_MAX);
    else acc.body = clamp(value, BODY_MAX);
    return;
  }

  if (target.field === 'points') {
    if (!target.section) return;
    const value = cleanValue(rawValue);
    if (!value) {
      c.openList = { field: 'points', section: target.section };
      return;
    }
    for (const item of value.split(';').map((p) => p.trim())) {
      if (item) pushBullet(c, target.section, item);
    }
    return;
  }

  if (target.field === 'brands') {
    const value = cleanValue(rawValue);
    if (!value) {
      c.openList = { field: 'brands', section: 'competitorLogos' };
      return;
    }
    for (const item of value.split(';').map((p) => p.trim())) {
      if (item) pushBrand(c, item);
    }
    return;
  }

  // sources
  const value = cleanValue(rawValue);
  if (!value) {
    c.openList = { field: 'sources', section: null };
    return;
  }
  for (const item of value.split(';').map((p) => p.trim())) {
    if (item) pushSource(c, item);
  }
}

// ---------- Line scanner ----------

const FIELD_LINE_RE =
  /^\s*(?:[-*>•·‣]+\s*)?(?:\d{1,2}[.)]\s*)?[*_>#\s]*([A-Za-z][A-Za-z_ -]{1,40}?)[*_\s]*[:=][*_\s]*(.*)$/;

const BULLET_RE = /^\s*(?:[-*•·‣>]+|\d{1,2}[.)])\s+(.+)$/;

function scanLines(body: string, c: CollectState): void {
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue; // blank lines do not close the open list

    // While a list is open, bulleted lines are list items — their content
    // often contains colons and would confuse field matching.
    const bullet = BULLET_RE.exec(line);
    if (c.openList && bullet) {
      pushListItem(c, bullet[1] ?? '');
      continue;
    }

    const match = FIELD_LINE_RE.exec(line);
    if (match) {
      const key = (match[1] ?? '').toUpperCase().replace(/[^A-Z]/g, '');
      const target = KEY_LOOKUP[key];
      if (target) {
        applyKeyTarget(c, target, match[2] ?? '');
        continue;
      }
    }

    if (bullet) continue; // stray bullet with no open list — ignore prose

    // Any other non-blank line closes the open list (prose between lists).
    c.openList = null;
  }
}

// ---------- JSON fallback ----------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function collectJsonBullets(value: unknown, acc: SectionAcc): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const cleaned = clamp(cleanValue(item), BULLET_MAX);
    if (!cleaned) continue;
    if (acc.bullets.some((b) => b.toLowerCase() === cleaned.toLowerCase())) continue;
    if (acc.bullets.length >= BULLETS_MAX) break;
    acc.bullets.push(cleaned);
  }
}

function collectJsonBrands(value: unknown, c: CollectState): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (c.brands.length >= BRANDS_MAX) break;
    const o = isPlainObject(item) ? item : {};
    const name = cleanValue(typeof o.name === 'string' ? o.name : '');
    if (!name) continue;
    const brand: CompetitorBrand = {
      name: clamp(name, BRAND_NAME_MAX),
      colors: clamp(cleanValue(typeof o.colors === 'string' ? o.colors : ''), BRAND_COLORS_MAX),
      approach: clamp(cleanValue(typeof o.approach === 'string' ? o.approach : ''), BRAND_APPROACH_MAX),
    };
    if (c.brands.some((b) => b.name.toLowerCase() === brand.name.toLowerCase())) continue;
    c.brands.push(brand);
  }
}

function collectJsonSources(value: unknown, c: CollectState): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (c.sources.length >= SOURCES_MAX) break;
    if (typeof item === 'string') {
      const parsed = parseSourceItem(cleanValue(item));
      if (parsed) c.sources.push(parsed);
      continue;
    }
    const o = isPlainObject(item) ? item : {};
    const name = cleanValue(typeof o.name === 'string' ? o.name : '');
    const url = cleanValue(typeof o.url === 'string' ? o.url : typeof o.link === 'string' ? o.link : '');
    const note = cleanValue(typeof o.note === 'string' ? o.note : '');
    if (!name && !url) continue;
    c.sources.push({
      name: clamp(name || url, SOURCE_NAME_MAX),
      url: clamp(url, SOURCE_URL_MAX),
      note: clamp(note, SOURCE_NOTE_MAX),
    });
  }
}

function collectFromJson(obj: Record<string, unknown>, c: CollectState): void {
  const hasSectionKey = RESEARCH_SECTIONS.some((meta) =>
    Object.keys(obj).some((k) => SECTION_BY_ALIAS[k.toUpperCase().replace(/[^A-Z]/g, '')] === meta.key),
  );
  const sectionsRaw = isPlainObject(obj.sections) ? obj.sections : hasSectionKey ? obj : null;
  if (sectionsRaw) {
    for (const [key, value] of Object.entries(sectionsRaw)) {
      const section = SECTION_BY_ALIAS[key.toUpperCase().replace(/[^A-Z]/g, '')];
      if (!section || !isPlainObject(value)) continue;
      const acc = sectionAcc(c, section);
      const title = cleanValue(typeof value.title === 'string' ? value.title : '');
      const body = cleanValue(
        typeof value.body === 'string' ? value.body : typeof value.summary === 'string' ? value.summary : '',
      );
      if (title) acc.title = clamp(title, TITLE_MAX);
      if (body) acc.body = clamp(body, BODY_MAX);
      collectJsonBullets(value.bullets, acc);
      if (section === 'competitorLogos') collectJsonBrands(value.brands, c);
    }
  }
  collectJsonSources(obj.sources, c);
}

// ---------- Result builders ----------

function buildParsed(c: CollectState): ParsedResearch {
  const mkSection = (key: ResearchSectionKey): ParsedResearchSection | null => {
    const acc = c.sections[key];
    if (!acc) return null;
    const title = acc.title?.trim() || null;
    const body = acc.body?.trim() || null;
    const bullets = acc.bullets.length > 0 ? acc.bullets : null;
    if (!title && !body && !bullets) return null;
    return { title, body, bullets };
  };

  const competitorAcc = c.sections.competitorLogos;
  const brands = c.brands.length > 0 ? c.brands : null;
  const competitorLogos: ParsedCompetitorLogos | null =
    competitorAcc || brands
      ? {
          title: competitorAcc?.title?.trim() || null,
          body: competitorAcc?.body?.trim() || null,
          brands,
        }
      : null;

  const sources = c.sources.length > 0 ? c.sources : null;

  const sections = {
    audiencePsychology: mkSection('audiencePsychology'),
    trustFactors: mkSection('trustFactors'),
    successfulPatterns: mkSection('successfulPatterns'),
    competitorLogos,
    colorTheory: mkSection('colorTheory'),
    commonMistakes: mkSection('commonMistakes'),
  };

  const found: string[] = [];
  for (const meta of RESEARCH_SECTIONS) {
    const fix = sections[meta.key];
    const hasContent =
      (fix && !('brands' in fix) && !!(fix.title || fix.body || fix.bullets)) ||
      (meta.key === 'competitorLogos' && !!competitorLogos);
    if (hasContent) found.push(meta.label);
  }
  if (brands) found.push('competitor brands');
  if (sources) found.push('sources');

  return { sections, sources, found };
}

/**
 * Parse an agent reply without any network call. Handles:
 * - the exact DESIGNFORGE_RESEARCH block,
 * - loose `SECTION_FIELD: value` lines with `- ` bullet lists,
 * - a JSON object with section / sources keys.
 * Returns a ParsedResearch whose `found` lists what was recognized.
 */
export function parseResearchLocally(text: string): ParsedResearch {
  const raw = (text ?? '').trim().slice(0, PARSE_RESEARCH_MAX_CHARS);
  const c = newCollectState();
  if (!raw) return buildParsed(c);

  // 1) JSON shape? (some agents answer with an object instead of the block)
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const obj: unknown = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      if (isPlainObject(obj)) collectFromJson(obj, c);
    } catch {
      // Not valid JSON — fall through to line scanning.
    }
  }

  // 2) Line scan (covers the block and loose field lines).
  if (!hasAnything(c)) {
    const blockMatch = BLOCK_RE.exec(raw);
    const body = blockMatch ? blockMatch[1] : raw;
    scanLines(body, c);
  }

  return buildParsed(c);
}

// ============================================================
// Merge into the current report
// ============================================================

/**
 * Merge a parsed agent reply over the current report: fields the reply
 * sets win, everything it left out stays exactly as it was (partial
 * fixes are the point of the review flow).
 */
export function mergeParsedResearch(
  parsed: ParsedResearch,
  base: { sections: ResearchSections; sources: ResearchSource[] },
): { sections: ResearchSections; sources: ResearchSource[] } {
  const sections: ResearchSections = {
    ...base.sections,
    competitorLogos: { ...base.sections.competitorLogos },
  };

  const normalKeys = RESEARCH_SECTIONS.filter((m) => m.key !== 'competitorLogos');
  for (const meta of normalKeys) {
    const fix = parsed.sections[meta.key as Exclude<ResearchSectionKey, 'competitorLogos'>];
    if (!fix) continue;
    const current = sections[meta.key as Exclude<ResearchSectionKey, 'competitorLogos'>];
    sections[meta.key as Exclude<ResearchSectionKey, 'competitorLogos'>] = {
      title: fix.title ?? current.title,
      body: fix.body ?? current.body,
      bullets: fix.bullets ?? current.bullets,
    };
  }

  const comp = parsed.sections.competitorLogos;
  if (comp) {
    sections.competitorLogos = {
      title: comp.title ?? sections.competitorLogos.title,
      body: comp.body ?? sections.competitorLogos.body,
      brands: comp.brands ?? sections.competitorLogos.brands,
    };
  }

  return {
    sections,
    sources: parsed.sources ?? base.sources,
  };
}

// ============================================================
// AI pipeline helpers (server only).
// Wraps gateway-client with JSON-extraction + retry logic and
// provides normalizeTokens(), the bulletproof DesignTokens
// normalizer that guarantees the frontend never crashes.
// ============================================================

import ZAI, {
  type SearchFunctionResultItem,
  type VisionMultimodalContentItem,
} from 'gateway-client';
import type {
  ColorRole,
  ColorToken,
  DesignTokens,
  PaletteStep,
} from '@/lib/types';
import { FONT_OPTIONS } from '@/lib/types';
import {
  bestTextColor,
  colorNameFromHex,
  contrastRatio,
  darkenHex,
  lightenHex,
  mixHex,
} from '@/lib/server/logo-image';

// ---------- SDK singleton ----------

let zaiPromise: Promise<ZAI> | null = null;

/** Create (once) and return the shared ZAI SDK instance. */
export async function getZAI(): Promise<ZAI> {
  zaiPromise ??= ZAI.create();
  return zaiPromise;
}

// ---------- JSON extraction ----------

/** Remove surrounding ```json / ``` fences and trim. */
export function stripFences(text: string): string {
  let out = (text ?? '').trim();
  if (out.startsWith('```')) {
    out = out.replace(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n?/, '');
  }
  if (out.endsWith('```')) {
    out = out.replace(/\r?\n?[ \t]*```$/, '');
  }
  return out.trim();
}

/**
 * Extract the first balanced {...} or [...] block (string-aware) and
 * JSON.parse it. Throws a descriptive error on failure.
 */
export function extractJson<T = unknown>(text: string): T {
  const cleaned = stripFences(text ?? '');
  const start = cleaned.search(/[{[]/);
  if (start === -1) {
    throw new Error('No JSON object or array found in model response.');
  }
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch (err) {
          throw new Error(
            `Failed to parse JSON from model response: ${err instanceof Error ? err.message : String(err)}. Snippet: ${candidate.slice(0, 200)}`,
          );
        }
      }
    }
  }
  throw new Error('Unbalanced JSON block in model response.');
}

const RETRY_NOTE = 'Your previous response was not valid JSON. Respond with ONLY the JSON object.';

function backoffMs(attempt: number): number {
  return 1000 * 2 ** attempt; // 1s, 2s, 4s...
}

// ---------- LLM calls ----------

/** Text LLM call parsed as JSON, with retries + exponential backoff. */
export async function llmJson<T>(system: string, user: string, attempts = 3): Promise<T> {
  const zai = await getZAI();
  let lastRaw = '';
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const messages: Array<{ role: 'assistant' | 'user'; content: string }> = [
        { role: 'assistant', content: system },
        { role: 'user', content: user },
      ];
      if (attempt > 0) messages.push({ role: 'user', content: RETRY_NOTE });
      const res = await zai.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
      });
      const text: string = res?.choices?.[0]?.message?.content ?? '';
      lastRaw = text;
      return extractJson<T>(text);
    } catch (err) {
      lastError = err;
      console.error(`llmJson attempt ${attempt + 1}/${attempts} failed:`, err instanceof Error ? err.message : err);
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `LLM JSON generation failed after ${attempts} attempts: ${reason}. Last raw output: ${lastRaw.slice(0, 500)}`,
  );
}

/** Vision LLM call (logo analysis) parsed as JSON, with retries. */
export async function visionJson<T>(prompt: string, base64Png: string, attempts = 2): Promise<T> {
  const zai = await getZAI();
  let lastRaw = '';
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const content: VisionMultimodalContentItem[] = [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Png}` } },
      ];
      if (attempt > 0) content.push({ type: 'text', text: RETRY_NOTE });
      const res = await zai.chat.completions.createVision({
        model: 'glm-4.6v',
        messages: [{ role: 'user', content }],
        thinking: { type: 'disabled' },
      });
      const text: string = res?.choices?.[0]?.message?.content ?? '';
      lastRaw = text;
      return extractJson<T>(text);
    } catch (err) {
      lastError = err;
      console.error(`visionJson attempt ${attempt + 1}/${attempts} failed:`, err instanceof Error ? err.message : err);
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Vision JSON generation failed after ${attempts} attempts: ${reason}. Last raw output: ${lastRaw.slice(0, 500)}`,
  );
}

/** Plain-text LLM call (used for DESIGN.md markdown), with retries. */
export async function llmText(system: string, user: string, attempts = 2): Promise<string> {
  const zai = await getZAI();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: system },
          { role: 'user', content: user },
        ],
        thinking: { type: 'disabled' },
      });
      const text: string = res?.choices?.[0]?.message?.content ?? '';
      if (!text.trim()) throw new Error('Model returned an empty response.');
      return text;
    } catch (err) {
      lastError = err;
      console.error(`llmText attempt ${attempt + 1}/${attempts} failed:`, err instanceof Error ? err.message : err);
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`LLM text generation failed after ${attempts} attempts: ${reason}`);
}

/** Real internet web search via the SDK function-calling bridge. */
export async function webSearch(query: string, num = 5): Promise<SearchFunctionResultItem[]> {
  const zai = await getZAI();
  const results = await zai.functions.invoke('web_search', { query, num });
  return Array.isArray(results) ? results : [];
}

// ---------- DesignTokens normalization ----------

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const CSS_LENGTH_RE = /^-?\d*\.?\d+(rem|em|px|pt|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in)$/i;

function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Non-empty string → trimmed, else null. */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function cssLength(v: unknown, fallback: string): string {
  return typeof v === 'string' && CSS_LENGTH_RE.test(v.trim()) ? v.trim() : fallback;
}

function cssShadow(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() && /(px|rgb)/.test(v) ? v.trim() : fallback;
}

/** Keep string array entries, trim, drop empties, cap. */
function stringList(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, cap);
}

const ROLE_DEFAULT_USAGE: Record<ColorRole, string> = {
  primary: 'Primary actions, links, active states and key brand moments',
  primaryForeground: 'Text and icons rendered on top of the primary color',
  secondary: 'Secondary surfaces, soft highlights and hover fills',
  accent: 'Accents, badges and emphasized interactive elements',
  background: 'Page and section backgrounds',
  foreground: 'Default body text and headings',
  muted: 'Muted surfaces, subtle fills and skeleton placeholders',
  mutedForeground: 'Secondary text, captions and placeholders',
  border: 'Borders, dividers and outlined control edges',
  success: 'Success states, confirmations and positive metrics',
  warning: 'Warning states and cautionary banners',
  danger: 'Destructive actions, errors and critical alerts',
};

function normalizeColorToken(raw: unknown, role: ColorRole, defaultHex: string): ColorToken {
  const r = isPlainObject(raw) ? raw : {};
  const hex = isHex(r.hex) ? r.hex : defaultHex;
  const name = str(r.name) ?? colorNameFromHex(hex);
  const usage = str(r.usage) ?? ROLE_DEFAULT_USAGE[role];
  return { hex, name, usage };
}

const PALETTE_STEP_NAMES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

function normalizePaletteScale(raw: unknown, primaryHex: string): PaletteStep[] {
  const entries = (Array.isArray(raw) ? raw : []).filter(
    (s) => isPlainObject(s) && isHex((s as Record<string, unknown>).hex),
  );
  if (entries.length >= 5 && entries.length <= 12) {
    return entries.slice(0, 12).map((s, i) => {
      const e = s as Record<string, unknown>;
      const hex = e.hex as string;
      return {
        step: PALETTE_STEP_NAMES[i] ?? String(950 + (i - 10) * 50),
        hex,
        name: str(e.name) ?? colorNameFromHex(hex),
      };
    });
  }
  // Generate a deterministic 10-step scale from the primary color.
  const plan: Array<['#FFFFFF' | '#000000' | null, number]> = [
    ['#FFFFFF', 0.92],
    ['#FFFFFF', 0.84],
    ['#FFFFFF', 0.68],
    ['#FFFFFF', 0.5],
    ['#FFFFFF', 0.3],
    [null, 0], // primary itself
    ['#000000', 0.12],
    ['#000000', 0.24],
    ['#000000', 0.38],
    ['#000000', 0.52],
  ];
  return PALETTE_STEP_NAMES.map((step, i) => {
    const [target, t] = plan[i];
    const hex = target ? mixHex(primaryHex, target, t) : primaryHex;
    return { step, hex, name: colorNameFromHex(hex) };
  });
}

const FONT_LIST: readonly string[] = FONT_OPTIONS;

function fontFamily(v: unknown): string {
  return typeof v === 'string' && FONT_LIST.includes(v) ? v : 'Inter';
}

function fontWeights(v: unknown, fallback: number[]): number[] {
  if (!Array.isArray(v)) return fallback;
  const snapped = [
    ...new Set(
      v
        .map((w) => Math.round((Number(w) || 0) / 100) * 100)
        .filter((w) => Number.isFinite(w) && w >= 100 && w <= 900),
    ),
  ].sort((a, b) => a - b);
  return snapped.length ? snapped : fallback;
}

/**
 * Deep-merge a (possibly partial/garbage) tokens object over safe defaults.
 * Guarantees a complete, valid DesignTokens object — the frontend never
 * crashes on LLM output. Also enforces the WCAG AA primary/primaryForeground
 * contrast invariant (re-picks bestTextColor when contrast < 4.5).
 */
export const normalizeTokens = (raw: unknown, fallbackPrimary?: string, fallbackSecondary?: string): DesignTokens => {
  let rawObj: unknown = raw;
  if (typeof rawObj === 'string') {
    try {
      rawObj = JSON.parse(rawObj);
    } catch {
      rawObj = {};
    }
  }
  const root = isPlainObject(rawObj) ? rawObj : {};
  const rawColors = isPlainObject(root.colors) ? root.colors : {};

  // Resolve primary: raw → fallbackPrimary → default.
  const primaryHex = isHex(rawColors.primary?.['hex'])
    ? (rawColors.primary?.['hex'] as string)
    : isHex(fallbackPrimary)
      ? (fallbackPrimary as string)
      : '#0F766E';

  const colors = {
    primary: normalizeColorToken(rawColors.primary, 'primary', primaryHex),
    primaryForeground: normalizeColorToken(
      rawColors.primaryForeground,
      'primaryForeground',
      bestTextColor(primaryHex),
    ),
    secondary: normalizeColorToken(
      rawColors.secondary,
      'secondary',
      isHex(fallbackSecondary) ? (fallbackSecondary as string) : lightenHex(primaryHex, 0.82),
    ),
    accent: normalizeColorToken(rawColors.accent, 'accent', darkenHex(primaryHex, 0.18)),
    background: normalizeColorToken(rawColors.background, 'background', '#FFFFFF'),
    foreground: normalizeColorToken(rawColors.foreground, 'foreground', '#18181B'),
    muted: normalizeColorToken(rawColors.muted, 'muted', '#F4F4F5'),
    mutedForeground: normalizeColorToken(rawColors.mutedForeground, 'mutedForeground', '#71717A'),
    border: normalizeColorToken(rawColors.border, 'border', '#E4E4E7'),
    success: normalizeColorToken(rawColors.success, 'success', '#16A34A'),
    warning: normalizeColorToken(rawColors.warning, 'warning', '#D97706'),
    danger: normalizeColorToken(rawColors.danger, 'danger', '#DC2626'),
  } as DesignTokens['colors'];

  // WCAG AA invariant: primary text on primary must reach 4.5:1.
  if (contrastRatio(colors.primary.hex, colors.primaryForeground.hex) < 4.5) {
    const fg = bestTextColor(colors.primary.hex);
    colors.primaryForeground = {
      hex: fg,
      name: colorNameFromHex(fg),
      usage: ROLE_DEFAULT_USAGE.primaryForeground,
    };
  }

  const rawBrand = isPlainObject(root.brand) ? root.brand : {};
  const rawTypography = isPlainObject(root.typography) ? root.typography : {};
  const rawHeading = isPlainObject(rawTypography.heading) ? rawTypography.heading : {};
  const rawBody = isPlainObject(rawTypography.body) ? rawTypography.body : {};
  const rawScale = isPlainObject(rawTypography.scale) ? rawTypography.scale : {};
  const rawRadius = isPlainObject(root.radius) ? root.radius : {};
  const rawShadows = isPlainObject(root.shadows) ? root.shadows : {};
  const rawButtons = isPlainObject(root.buttons) ? root.buttons : {};

  const tokens: DesignTokens = {
    brand: {
      name: str(rawBrand.name) ?? '',
      personality: stringList(rawBrand.personality, 6),
      voice: str(rawBrand.voice) ?? '',
    },
    colors,
    paletteScale: normalizePaletteScale(root.paletteScale, colors.primary.hex),
    typography: {
      heading: {
        family: fontFamily(rawHeading.family),
        weights: fontWeights(rawHeading.weights, [700]),
        letterSpacing: cssLength(rawHeading.letterSpacing, '-0.01em'),
      },
      body: {
        family: fontFamily(rawBody.family),
        weights: fontWeights(rawBody.weights, [400, 500]),
        lineHeight: cssLength(rawBody.lineHeight, '1.6'),
      },
      scale: {
        h1: cssLength(rawScale.h1, '2.5rem'),
        h2: cssLength(rawScale.h2, '2rem'),
        h3: cssLength(rawScale.h3, '1.5rem'),
        h4: cssLength(rawScale.h4, '1.25rem'),
        body: cssLength(rawScale.body, '1rem'),
        small: cssLength(rawScale.small, '0.875rem'),
        caption: cssLength(rawScale.caption, '0.75rem'),
      },
    },
    radius: {
      sm: cssLength(rawRadius.sm, '0.375rem'),
      md: cssLength(rawRadius.md, '0.5rem'),
      lg: cssLength(rawRadius.lg, '1rem'),
      full: cssLength(rawRadius.full, '9999px'),
    },
    shadows: {
      sm: cssShadow(rawShadows.sm, '0 1px 2px 0 rgb(0 0 0 / 0.05)'),
      md: cssShadow(
        rawShadows.md,
        '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      ),
      lg: cssShadow(
        rawShadows.lg,
        '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      ),
    },
    buttons: {
      primary: str(rawButtons.primary) ?? 'filled',
      secondary: str(rawButtons.secondary) ?? 'soft',
      shape: str(rawButtons.shape) ?? 'rounded',
    },
    trustPatterns: stringList(root.trustPatterns, 8),
  };

  return tokens;
};

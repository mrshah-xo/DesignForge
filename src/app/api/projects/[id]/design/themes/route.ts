// ============================================================
// POST /api/projects/[id]/design/themes — start async AI theme
//   variant generation (3 research-grounded alternatives)
// GET  ?jobId= — poll the job status
// GET  (no jobId) — list the stored theme variants
//
// The LLM returns a COMPACT direction spec per theme (name, reason,
// score, primary hex, surface mode, fonts, shape) — NOT full token
// JSON. Requesting full DesignTokens blew past the model's output
// limit, truncated mid-JSON, and failed every retry ("Unbalanced
// JSON"), leaving the user staring at skeletons for minutes. The
// compact spec parses in seconds; this route then merges each spec
// over the applied design's tokens deterministically (surfaces for
// light/dark, radius/shadow presets per shape) and runs the result
// through the same normalizeTokens pipeline as the main design, so
// switching a theme in the live preview is always safe.
// ============================================================

import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import type { AudienceData, AnalysisData, DesignTokens, ResearchData, ThemeVariant } from '@/lib/types';
import { db } from '@/lib/db';
import {
  assertAiUsable,
  isMissingUserKey,
  llmJson,
  normalizeTokens,
  userKeyFromRequest,
} from '@/lib/server/ai';
import { darkenHex, mixHex } from '@/lib/server/logo-image';
import { THEMES_SYSTEM, buildThemesPrompt } from '@/lib/server/prompts';
import {
  parseAnalysisRow,
  parseAudienceRow,
  parseResearchRow,
  parseThemeRow,
  safeJsonParse,
} from '@/lib/server/export';
import {
  createJob,
  finishJob,
  findRunningJob,
  getJob,
  jobStartTs,
  publicJob,
  setJobProgress,
  syntheticJob,
  JOB_TS_SKEW_MS,
  STALE_JOB_MS,
} from '@/lib/server/jobs';
import { withSchemaRetry } from '@/lib/server/ensure-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel: `after()` keeps the invocation alive past the POST response.
export const maxDuration = 120;

const MAX_THEMES = 3;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const FONT_WHITELIST = [
  'Inter',
  'Manrope',
  'Poppins',
  'Space Grotesk',
  'Sora',
  'Outfit',
  'IBM Plex Sans',
  'Playfair Display',
  'DM Serif Display',
  'Lora',
  'Merriweather',
  'JetBrains Mono',
] as const;

interface ThemeDirection {
  name: string;
  reason: string;
  score: number;
  primary: string | null;
  surface: 'light' | 'dark';
  heading: string | null;
  body: string | null;
  shape: 'sharp' | 'soft' | 'generous';
}

/** Best-effort extraction of the compact theme array from the LLM response. */
function extractThemeArray(raw: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [
    raw.themes,
    raw.variants,
    raw.directions,
    isPlainObject(raw.data) ? raw.data.themes : undefined,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      return c.filter(isPlainObject);
    }
  }
  throw new Error('Model response contained no themes array');
}

function parseDirection(entry: Record<string, unknown>, index: number): ThemeDirection {
  const rawScore = Number(entry.score);
  const primaryRaw = typeof entry.primary === 'string' ? entry.primary.trim() : '';
  const surfaceRaw = typeof entry.surface === 'string' ? entry.surface.toLowerCase() : '';
  const shapeRaw = typeof entry.shape === 'string' ? entry.shape.toLowerCase() : '';
  const font = (key: 'heading' | 'body'): string | null => {
    const raw = typeof entry[key] === 'string' ? (entry[key] as string).trim() : '';
    const hit = FONT_WHITELIST.find((f) => f.toLowerCase() === raw.toLowerCase());
    return hit ?? null;
  };
  return {
    name:
      typeof entry.name === 'string' && entry.name.trim()
        ? entry.name.trim().slice(0, 40)
        : `Direction ${index + 1}`,
    reason:
      typeof entry.reason === 'string' && entry.reason.trim()
        ? entry.reason.trim()
        : 'Research-aligned alternative direction.',
    score: Number.isFinite(rawScore)
      ? Math.max(0, Math.min(100, Math.round(rawScore)))
      : Math.max(60, 88 - index * 6),
    primary: HEX_RE.test(primaryRaw) ? primaryRaw : null,
    surface: surfaceRaw.includes('dark') ? 'dark' : 'light',
    heading: font('heading'),
    body: font('body'),
    shape: shapeRaw.includes('sharp')
      ? 'sharp'
      : shapeRaw.includes('generous')
        ? 'generous'
        : 'soft',
  };
}

// ---------- Deterministic token building from a direction spec ----------

const SHAPE_PRESETS: Record<
  ThemeDirection['shape'],
  { radius: DesignTokens['radius']; shadows: DesignTokens['shadows'] }
> = {
  sharp: {
    radius: { sm: '4px', md: '6px', lg: '10px', full: '9999px' },
    shadows: {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.06)',
      md: '0 2px 4px 0 rgb(0 0 0 / 0.08)',
      lg: '0 4px 12px 0 rgb(0 0 0 / 0.10)',
    },
  },
  soft: {
    radius: { sm: '6px', md: '10px', lg: '16px', full: '9999px' },
    shadows: {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    },
  },
  generous: {
    radius: { sm: '10px', md: '16px', lg: '24px', full: '9999px' },
    shadows: {
      sm: '0 1px 3px 0 rgb(0 0 0 / 0.04)',
      md: '0 6px 16px -4px rgb(0 0 0 / 0.10)',
      lg: '0 20px 45px -12px rgb(0 0 0 / 0.16)',
    },
  },
};

const ROLE_LABELS: Record<string, string> = {
  primary: 'Primary',
  primaryForeground: 'On primary',
  secondary: 'Secondary',
  accent: 'Accent',
  background: 'Background',
  foreground: 'Text',
  muted: 'Muted surface',
  mutedForeground: 'Muted text',
  border: 'Border',
};

function token(hex: string, role: string, usage: string): Record<string, unknown> {
  return { hex, name: ROLE_LABELS[role] ?? role, usage };
}

/**
 * Merge a compact direction spec over the applied design's tokens:
 * primary + light/dark surface palette + fonts + radius/shadow presets.
 * previewCopy/trustPatterns/brand carry over verbatim. The result runs
 * through normalizeTokens (WCAG AA on-primary re-check, palette scale
 * regeneration) so every variant is as safe as the main design.
 */
function buildThemeTokens(
  dir: ThemeDirection,
  base: DesignTokens | null,
  fallbackPrimary?: string,
): Record<string, unknown> {
  const baseObj: Record<string, unknown> = base
    ? (JSON.parse(JSON.stringify(base)) as Record<string, unknown>)
    : {};
  delete baseObj.paletteScale; // regenerated from each variant's own primary
  delete baseObj.style; // directions are pure token alternatives

  const colors: Record<string, Record<string, unknown>> = isPlainObject(baseObj.colors)
    ? (JSON.parse(JSON.stringify(baseObj.colors)) as Record<string, Record<string, unknown>>)
    : {};

  const primary = dir.primary ?? fallbackPrimary ?? '#0F766E';
  colors.primary = token(primary, 'primary', 'Primary actions and highlights');

  if (dir.surface === 'dark') {
    // Deep graphite surfaces tinted by the direction's primary.
    colors.secondary = token(mixHex(primary, '#101620', 0.9), 'secondary', 'Elevated surfaces on dark');
    colors.accent = token(mixHex(primary, '#141B26', 0.72), 'accent', 'Chips and soft highlights on dark');
    colors.background = token(mixHex('#0B0F14', primary, 0.06), 'background', 'Page canvas on dark');
    colors.foreground = token('#F2F5F8', 'foreground', 'Primary text on dark surfaces');
    colors.muted = token(mixHex('#151B23', primary, 0.05), 'muted', 'Cards, wells and secondary fills');
    colors.mutedForeground = token('#A6B0BC', 'mutedForeground', 'Secondary text and captions');
    colors.border = token(mixHex('#26303B', primary, 0.10), 'border', 'Dividers, outlines and input borders');
  } else {
    // Bright neutral surfaces tinted by the direction's primary.
    colors.secondary = token(mixHex('#F4F6F8', primary, 0.08), 'secondary', 'Soft secondary fills and chips');
    colors.accent = token(mixHex('#ECF2F5', primary, 0.14), 'accent', 'Badges, chips and soft highlights');
    colors.background = token(mixHex('#FFFFFF', primary, 0.03), 'background', 'Page and section backgrounds');
    colors.foreground = token('#101418', 'foreground', 'Primary text on light surfaces');
    colors.muted = token(mixHex('#F3F5F7', primary, 0.06), 'muted', 'Cards, wells and secondary fills');
    colors.mutedForeground = token('#5B6470', 'mutedForeground', 'Secondary text and captions');
    colors.border = token(mixHex('#E5E8EC', primary, 0.10), 'border', 'Dividers, outlines and input borders');
  }

  const typography = isPlainObject(baseObj.typography)
    ? (baseObj.typography as Record<string, unknown>)
    : {};
  const heading = isPlainObject(typography.heading) ? { ...typography.heading } : {};
  const body = isPlainObject(typography.body) ? { ...typography.body } : {};
  if (dir.heading) heading.family = dir.heading;
  if (dir.body) body.family = dir.body;
  typography.heading = heading;
  typography.body = body;

  const { radius, shadows } = SHAPE_PRESETS[dir.shape];

  return {
    ...baseObj,
    colors,
    typography,
    radius,
    shadows,
  };
}

/**
 * Deterministic fallback variants, used when the LLM fails after all
 * retries (empty/filtered responses, unparseable output, provider outages).
 * Derived from the applied design's tokens (or the logo palette) so the
 * user still gets three usable, WCAG-checked directions instead of a
 * dead end — each one is normalized through the same pipeline as the
 * LLM output, so switching to it in the preview is always safe.
 */
function fallbackVariants(
  currentTokens: DesignTokens | null,
  analysis: AnalysisData,
): { dir: ThemeDirection; tokens: Record<string, unknown> }[] {
  const primary =
    currentTokens?.colors?.primary?.hex ?? analysis.palette[0]?.hex ?? '#0F766E';
  const mk = (
    over: Partial<ThemeDirection>,
    tokens: Record<string, unknown>,
  ): { dir: ThemeDirection; tokens: Record<string, unknown> } => ({
    dir: {
      name: 'Direction',
      reason: '',
      score: 80,
      primary,
      surface: 'light',
      heading: null,
      body: null,
      shape: 'soft',
      ...over,
    },
    tokens,
  });

  return [
    mk(
      {
        name: 'Signature',
        reason:
          'Faithful to your approved logo palette and the applied design — the safe, research-aligned baseline. (Deterministic fallback: the AI theme service was unavailable, so this direction was derived locally from your design tokens.)',
        score: 90,
        shape: 'soft',
      },
      buildThemeTokens(
        { name: 'Signature', reason: '', score: 90, primary, surface: 'light', heading: null, body: null, shape: 'soft' },
        currentTokens,
        primary,
      ),
    ),
    mk(
      {
        name: 'Deep Contrast',
        reason:
          'Darker, higher-contrast direction: a deepened primary for gravitas with a serif display pairing — aligns with trust-heavy research findings. (Deterministic fallback derived from your palette.)',
        score: 84,
        surface: 'dark',
        heading: 'Playfair Display',
        body: 'Lora',
        shape: 'sharp',
      },
      buildThemeTokens(
        { name: 'Deep Contrast', reason: '', score: 84, primary: darkenHex(primary, 0.25), surface: 'dark', heading: 'Playfair Display', body: 'Lora', shape: 'sharp' },
        currentTokens,
        primary,
      ),
    ),
    mk(
      {
        name: 'Soft Air',
        reason:
          'Lighter, friendlier direction: a softened primary with generous radii — built for approachable, low-anxiety interfaces per the audience research. (Deterministic fallback derived from your palette.)',
        score: 78,
        surface: 'light',
        heading: 'Manrope',
        body: 'Inter',
        shape: 'generous',
      },
      buildThemeTokens(
        { name: 'Soft Air', reason: '', score: 78, primary: mixHex(primary, '#FFFFFF', 0.22), surface: 'light', heading: 'Manrope', body: 'Inter', shape: 'generous' },
        currentTokens,
        primary,
      ),
    ),
  ];
}

// ---------- Background pipeline ----------

async function runThemesPipeline(id: string, jobId: string, userKey: string | null): Promise<void> {
  try {
    setJobProgress(jobId, 'Reading your approved research…');
    const project = await db.project.findUnique({
      where: { id },
      include: { analysis: true, audience: true, research: true, design: true },
    });
    const analysis: AnalysisData | null = project ? parseAnalysisRow(project.analysis) : null;
    const audience: AudienceData | null = project ? parseAudienceRow(project.audience) : null;
    const research: ResearchData | null = project ? parseResearchRow(project.research) : null;
    if (!project || !analysis || !audience || !research || research.status !== 'approved') {
      throw new Error('Project prerequisites changed — complete research approval first');
    }
    const currentTokens: DesignTokens | null = project.design
      ? safeJsonParse<DesignTokens | null>(project.design.tokens, null)
      : null;

    // 1. Compact direction specs from the LLM (one call, ~2k budget — a
    //    reply this small cannot hit the output ceiling, so retries are
    //    rare and the whole job finishes in seconds, not minutes).
    //    If the LLM still fails after all retries (empty/filtered
    //    responses are a known provider flake), fall back to deterministic
    //    variants so the job completes instead of dead-ending the user.
    let directions: ThemeDirection[];
    let fallbackTokens: Map<string, Record<string, unknown>> | null = null;
    try {
      setJobProgress(jobId, 'Proposing 3 theme directions with AI…');
      const raw = await llmJson<Record<string, unknown>>(
        THEMES_SYSTEM,
        buildThemesPrompt(project, audience, analysis, research, currentTokens),
        3,
        2000,
        userKey,
        (attempt, attempts) => {
          setJobProgress(
            jobId,
            attempt === 1
              ? 'Proposing 3 theme directions with AI…'
              : `Refining theme directions (retry ${attempt}/${attempts})…`,
          );
        },
      );
      directions = extractThemeArray(raw)
        .slice(0, MAX_THEMES)
        .map((entry, index) => parseDirection(entry, index));
      if (directions.length === 0) throw new Error('Model returned no theme directions');
    } catch (llmErr) {
      console.error(
        `themes pipeline: LLM failed after retries for project ${id} — using deterministic fallback variants:`,
        llmErr instanceof Error ? llmErr.message : llmErr,
      );
      setJobProgress(jobId, 'AI unavailable — building fallback directions…');
      const fallbacks = fallbackVariants(currentTokens, analysis);
      directions = fallbacks.map((f) => f.dir);
      fallbackTokens = new Map(fallbacks.map((f) => [f.dir.name, f.tokens]));
    }

    // 2. Expand each direction into full tokens (merge over the applied
    //    design) and normalize through the same bulletproof pipeline as
    //    the main design (WCAG AA check, palette scale, fonts, copy).
    setJobProgress(jobId, 'Building tokens for each direction…');
    const baseCopy = currentTokens?.previewCopy;
    const baseTrust = currentTokens?.trustPatterns;
    const variants = directions.map((dir) => {
      const rawTokens =
        fallbackTokens?.get(dir.name) ?? buildThemeTokens(dir, currentTokens, analysis.palette[0]?.hex);
      const mergedTokens = isPlainObject(rawTokens) ? rawTokens : {};
      // Defensive copy: if the base design lacked copy/trust patterns,
      // the preview must never lose them.
      if (baseCopy && !isPlainObject(mergedTokens.previewCopy)) {
        mergedTokens.previewCopy = baseCopy;
      }
      if (baseTrust && !Array.isArray(mergedTokens.trustPatterns)) {
        mergedTokens.trustPatterns = baseTrust;
      }
      return {
        name: dir.name,
        reason: dir.reason,
        score: dir.score,
        tokens: normalizeTokens(mergedTokens, analysis.palette[0]?.hex, analysis.palette[1]?.hex),
      };
    });
    if (variants.length === 0) {
      throw new Error('No usable theme variants');
    }

    // 3. Replace the stored set (themes are regenerated as a group).
    setJobProgress(jobId, 'Saving your theme directions…');
    await withSchemaRetry(() =>
      db.$transaction([
        db.designTheme.deleteMany({ where: { projectId: id } }),
        ...variants.map((v) =>
          db.designTheme.create({
            data: { projectId: id, name: v.name, reason: v.reason, score: v.score, tokens: JSON.stringify(v.tokens) },
          }),
        ),
      ]),
    );

    finishJob(jobId, 'done');
  } catch (err) {
    console.error(`POST /api/projects/[id]/design/themes pipeline failed for ${id}:`, err);
    finishJob(jobId, 'error', err instanceof Error ? err.message : 'Theme generation failed');
  }
}

// ---------- POST: start generation (returns immediately) ----------

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Visitor's own key (BYOK) — captured here at request time and passed
    // explicitly into the background pipeline (after() detaches context).
    const userKey = userKeyFromRequest(req);
    const project = await db.project.findUnique({
      where: { id },
      include: { analysis: true, audience: true, research: true },
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }
    const analysis = parseAnalysisRow(project.analysis);
    const audience = parseAudienceRow(project.audience);
    const research = parseResearchRow(project.research);
    if (!analysis || !audience) {
      return NextResponse.json(
        { ok: false, error: 'Complete analysis and audience steps first' },
        { status: 409 },
      );
    }
    if (!research || research.status !== 'approved') {
      return NextResponse.json(
        { ok: false, error: 'Research must be reviewed and approved first' },
        { status: 409 },
      );
    }

    // Reuse an in-flight generation instead of stacking duplicates.
    const running = findRunningJob(id, 'themes');
    if (running) {
      return NextResponse.json({ ok: true, data: { job: publicJob(running) } });
    }

    const job = createJob('themes', id);
    // BYOK gate: reject before starting when no usable credentials exist.
    await assertAiUsable(userKey);
    after(() => runThemesPipeline(id, job.id, userKey));
    return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
  } catch (err) {
    console.error('POST /api/projects/[id]/design/themes failed:', err);
    const missing = isMissingUserKey(err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not start theme generation',
        ...(missing ? { requiresUserKey: true } : {}),
      },
      { status: missing ? 401 : 500 },
    );
  }
}

// ---------- GET: poll job status, or list stored themes ----------

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const jobId = req.nextUrl.searchParams.get('jobId');

    // No jobId → plain list of stored variants.
    if (!jobId) {
      const themes = await themesList(id);
      return NextResponse.json({ ok: true, data: { themes } });
    }

    const job = getJob(jobId);
    if (job && job.projectId === id) {
      if (job.status === 'running' || job.status === 'error') {
        return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
      }
      return NextResponse.json({ ok: true, data: await donePayload(id, job.id) });
    }

    // Serverless fallback: derive state from DB timestamps.
    return NextResponse.json({ ok: true, data: await fallbackJobPayload(id, jobId) });
  } catch (err) {
    console.error('GET /api/projects/[id]/design/themes failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not check theme generation status' },
      { status: 500 },
    );
  }
}

async function themesList(id: string): Promise<ThemeVariant[]> {
  const rows = await withSchemaRetry(() =>
    db.designTheme.findMany({
      where: { projectId: id },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
    }),
  );
  return rows.map(parseThemeRow);
}

/** Done payload shared by the in-memory fast path and the DB fallback. */
async function donePayload(
  id: string,
  jobId: string,
): Promise<{ job: ReturnType<typeof publicJob>; themes: ThemeVariant[] }> {
  const themes = await themesList(id);
  if (themes.length === 0) {
    throw new Error('Theme generation finished but no themes were saved');
  }
  return { job: syntheticJob(jobId, 'themes', id, 'done'), themes };
}

/**
 * Reconstruct job state from DB timestamps when the in-memory job is
 * unavailable (poll landed on a different serverless instance).
 */
async function fallbackJobPayload(
  id: string,
  jobId: string,
): Promise<{ job: ReturnType<typeof publicJob>; themes?: ThemeVariant[] }> {
  const startTs = jobStartTs(jobId);
  if (startTs === null) {
    return {
      job: syntheticJob(jobId, 'themes', id, 'error', 'Generation status could not be tracked. Please generate themes again.'),
    };
  }
  const latest = await withSchemaRetry(() =>
    db.designTheme.findFirst({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
    }),
  );
  if (latest && latest.createdAt.getTime() >= startTs - JOB_TS_SKEW_MS) {
    // The pipeline completed on another instance and saved the themes.
    return await donePayload(id, jobId);
  }
  if (Date.now() - startTs > STALE_JOB_MS) {
    return {
      job: syntheticJob(
        jobId,
        'themes',
        id,
        'error',
        'Theme generation was interrupted before it finished (often a deployment time limit). Please run it again.',
      ),
    };
  }
  return { job: syntheticJob(jobId, 'themes', id, 'running') };
}

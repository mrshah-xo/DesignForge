// ============================================================
// POST /api/projects/[id]/design/themes — start async AI theme
//   variant generation (3 research-grounded alternatives)
// GET  ?jobId= — poll the job status
// GET  (no jobId) — list the stored theme variants
//
// Themes are alternative DesignTokens sets derived from the
// approved research report (color theory, trust factors,
// competitor positioning). Each runs through the same
// normalizeTokens pipeline as the main design, so switching a
// theme in the live preview is safe. Generation takes ~30-60s,
// so POST returns a job id immediately (same pattern as design).
// ============================================================

import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import type { AudienceData, AnalysisData, DesignTokens, ResearchData, ThemeVariant } from '@/lib/types';
import { db } from '@/lib/db';
import { llmJson, normalizeTokens } from '@/lib/server/ai';
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
  syntheticJob,
  JOB_TS_SKEW_MS,
  STALE_JOB_MS,
} from '@/lib/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel: `after()` keeps the invocation alive past the POST response.
export const maxDuration = 120;

const MAX_THEMES = 3;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Best-effort extraction of the theme array from the LLM response. */
function extractThemeArray(raw: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [
    raw.themes,
    raw.variants,
    isPlainObject(raw.data) ? raw.data.themes : undefined,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      return c.filter(isPlainObject);
    }
  }
  throw new Error('Model response contained no themes array');
}

// ---------- Background pipeline ----------

async function runThemesPipeline(id: string, jobId: string): Promise<void> {
  try {
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

    // 1. Theme variants from the LLM (one call, 3 variants, ~16k budget).
    const raw = await llmJson<Record<string, unknown>>(
      THEMES_SYSTEM,
      buildThemesPrompt(project, audience, analysis, research, currentTokens),
    );

    // 2. Normalize every variant through the same bulletproof pipeline as
    //    the main design (WCAG AA check, palette scale, fonts, copy).
    const baseCopy = currentTokens?.previewCopy;
    const baseTrust = currentTokens?.trustPatterns;
    const variants = extractThemeArray(raw)
      .slice(0, MAX_THEMES)
      .map((entry, index) => {
        const mergedTokens = isPlainObject(entry.tokens) ? entry.tokens : {};
        // Defensive copy: if the model dropped previewCopy/trustPatterns,
        // fall back to the applied design's so the preview never loses copy.
        if (baseCopy && !isPlainObject(mergedTokens.previewCopy)) {
          mergedTokens.previewCopy = baseCopy;
        }
        if (baseTrust && !Array.isArray(mergedTokens.trustPatterns)) {
          mergedTokens.trustPatterns = baseTrust;
        }
        const rawScore = Number(entry.score);
        const name =
          typeof entry.name === 'string' && entry.name.trim()
            ? entry.name.trim().slice(0, 40)
            : `Direction ${index + 1}`;
        const reason =
          typeof entry.reason === 'string' && entry.reason.trim()
            ? entry.reason.trim()
            : 'Research-aligned alternative direction.';
        return {
          name,
          reason,
          score: Number.isFinite(rawScore)
            ? Math.max(0, Math.min(100, Math.round(rawScore)))
            : Math.max(60, 88 - index * 6),
          tokens: normalizeTokens(mergedTokens, analysis.palette[0]?.hex, analysis.palette[1]?.hex),
        };
      });
    if (variants.length === 0) {
      throw new Error('Model returned no usable theme variants');
    }

    // 3. Replace the stored set (themes are regenerated as a group).
    await db.$transaction([
      db.designTheme.deleteMany({ where: { projectId: id } }),
      ...variants.map((v) =>
        db.designTheme.create({
          data: { projectId: id, name: v.name, reason: v.reason, score: v.score, tokens: JSON.stringify(v.tokens) },
        }),
      ),
    ]);

    finishJob(jobId, 'done');
  } catch (err) {
    console.error(`POST /api/projects/[id]/design/themes pipeline failed for ${id}:`, err);
    finishJob(jobId, 'error', err instanceof Error ? err.message : 'Theme generation failed');
  }
}

// ---------- POST: start generation (returns immediately) ----------

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    after(() => runThemesPipeline(id, job.id));
    return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
  } catch (err) {
    console.error('POST /api/projects/[id]/design/themes failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not start theme generation' },
      { status: 500 },
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
  const rows = await db.designTheme.findMany({
    where: { projectId: id },
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
  });
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
  const latest = await db.designTheme.findFirst({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' },
  });
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

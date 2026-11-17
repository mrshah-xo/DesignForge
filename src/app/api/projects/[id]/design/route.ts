// ============================================================
// POST /api/projects/[id]/design — start async design generation
// GET  /api/projects/[id]/design?jobId= — poll job status
// PUT  /api/projects/[id]/design — manual token/markdown edits
//
// Generation takes 45-90s (tokens LLM + DESIGN.md LLM), which is
// longer than the preview gateway allows a single request to run.
// POST therefore returns a job id immediately while the pipeline
// runs in the background; the frontend polls GET until done.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { AudienceData, AnalysisData, DesignData, DesignTokens, LogoFeedback, ResearchData } from '@/lib/types';
import { db } from '@/lib/db';
import { llmJson, llmText, normalizeTokens, stripFences } from '@/lib/server/ai';
import {
  DESIGN_SYSTEM,
  MARKDOWN_SYSTEM,
  buildDesignPrompt,
  buildMarkdownPrompt,
} from '@/lib/server/prompts';
import {
  buildFallbackMarkdown,
  normalizeLogoFeedback,
  parseAnalysisRow,
  parseAudienceRow,
  parseDesignRow,
  parseResearchRow,
  safeJsonParse,
} from '@/lib/server/export';
import { createJob, finishJob, findRunningJob, getJob, publicJob } from '@/lib/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(base: unknown, override: unknown): Record<string, unknown> {
  const b = isPlainObject(base) ? base : {};
  const o = isPlainObject(override) ? override : {};
  const out: Record<string, unknown> = { ...b };
  for (const [key, value] of Object.entries(o)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Remove leading hash-only fence artifacts left by some models. */
function cleanMarkdown(text: string): string {
  let out = stripFences(text);
  const lines = out.split('\n');
  while (lines.length > 0 && /^#{1,6}\s*$/.test(lines[0].trim())) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

// ---------- Background pipeline ----------

/** Full design pipeline: tokens + fit report + DESIGN.md, persisted to DB. */
async function runDesignPipeline(id: string, jobId: string): Promise<void> {
  try {
    const project = await db.project.findUnique({
      where: { id },
      include: { analysis: true, audience: true, research: true },
    });
    const analysis: AnalysisData | null = project ? parseAnalysisRow(project.analysis) : null;
    const audience: AudienceData | null = project ? parseAudienceRow(project.audience) : null;
    const research: ResearchData | null = project ? parseResearchRow(project.research) : null;
    if (!project || !analysis || !audience || !research || research.status !== 'approved') {
      throw new Error('Project prerequisites changed — complete research approval first');
    }

    // 1. Tokens + match analysis from the LLM.
    const raw = await llmJson<Record<string, unknown>>(
      DESIGN_SYSTEM,
      buildDesignPrompt(project, audience, analysis, research),
    );

    // 2. Bulletproof normalization (also enforces the WCAG AA primary contrast).
    const normalized: DesignTokens = normalizeTokens(
      isPlainObject(raw.tokens) ? raw.tokens : {},
      analysis.palette[0]?.hex,
      analysis.palette[1]?.hex,
    );

    // 3. Match analysis + score (clamped 0-100, default 70).
    const rawMatch = isPlainObject(raw.matchAnalysis) ? raw.matchAnalysis : {};
    const logoFeedback: LogoFeedback = normalizeLogoFeedback(rawMatch);
    const rawScore = Number(rawMatch.score);
    const matchScore = Number.isFinite(rawScore)
      ? Math.max(0, Math.min(100, Math.round(rawScore)))
      : 70;

    // 4. DESIGN.md (raw markdown, never fails the request).
    let markdown = '';
    try {
      markdown = cleanMarkdown(
        await llmText(MARKDOWN_SYSTEM, buildMarkdownPrompt(project, audience, analysis, research, normalized, logoFeedback)),
      );
    } catch (err) {
      console.error(`DESIGN.md generation failed for project ${id}, using fallback template:`, err instanceof Error ? err.message : err);
      markdown = buildFallbackMarkdown(project, audience, analysis, research, normalized, matchScore);
    }

    // 5. Upsert DesignSpec + advance status.
    const record = {
      tokens: JSON.stringify(normalized),
      markdown,
      matchScore,
      logoFeedback: JSON.stringify(logoFeedback),
    };
    await db.$transaction([
      db.designSpec.upsert({
        where: { projectId: id },
        update: record,
        create: { projectId: id, ...record },
      }),
      db.project.update({ where: { id }, data: { status: 'design_ready' } }),
    ]);

    finishJob(jobId, 'done');
  } catch (err) {
    console.error(`POST /api/projects/[id]/design pipeline failed for ${id}:`, err);
    finishJob(jobId, 'error', err instanceof Error ? err.message : 'Design generation failed');
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
    const running = findRunningJob(id, 'design');
    if (running) {
      return NextResponse.json({ ok: true, data: { job: publicJob(running) } });
    }

    const job = createJob('design', id);
    void runDesignPipeline(id, job.id);
    return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
  } catch (err) {
    console.error('POST /api/projects/[id]/design failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not start design generation' },
      { status: 500 },
    );
  }
}

// ---------- GET: poll job status ----------

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const jobId = req.nextUrl.searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'jobId query parameter is required' }, { status: 400 });
    }
    const job = getJob(jobId);
    if (!job || job.projectId !== id) {
      return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
    }

    if (job.status === 'running') {
      return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
    }
    if (job.status === 'error') {
      return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
    }

    // Done — return the fresh design from the DB.
    const project = await db.project.findUnique({ where: { id }, include: { design: true } });
    const design = parseDesignRow(project?.design ?? null);
    if (!design) {
      return NextResponse.json(
        { ok: false, error: 'Generation finished but no design was saved' },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, data: { job: publicJob(job), design } });
  } catch (err) {
    console.error('GET /api/projects/[id]/design failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not check generation status' },
      { status: 500 },
    );
  }
}

// ---------- PUT: manual token / markdown edits ----------

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await db.project.findUnique({
      where: { id },
      include: { design: true, analysis: true },
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }
    if (!project.design) {
      return NextResponse.json(
        { ok: false, error: 'Design spec not found — generate a design first' },
        { status: 404 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const hasTokens = isPlainObject(body.tokens);
    const hasMarkdown = typeof body.markdown === 'string';
    if (!hasTokens && !hasMarkdown) {
      return NextResponse.json(
        { ok: false, error: 'Provide tokens and/or markdown (at least one)' },
        { status: 400 },
      );
    }

    const analysis = parseAnalysisRow(project.analysis);
    const existingTokens = safeJsonParse<unknown>(project.design.tokens, {});
    const mergedTokens = hasTokens
      ? normalizeTokens(
          deepMerge(existingTokens, body.tokens),
          analysis?.palette[0]?.hex,
          analysis?.palette[1]?.hex,
        )
      : normalizeTokens(existingTokens, analysis?.palette[0]?.hex, analysis?.palette[1]?.hex);
    const markdown = hasMarkdown ? (body.markdown as string) : project.design.markdown;

    const record = { tokens: JSON.stringify(mergedTokens), markdown };
    await db.designSpec.update({ where: { projectId: id }, data: record });

    const design: DesignData = {
      tokens: mergedTokens,
      markdown,
      matchScore: project.design.matchScore,
      logoFeedback: normalizeLogoFeedback(safeJsonParse<unknown>(project.design.logoFeedback, {})),
    };
    return NextResponse.json({ ok: true, data: { design } });
  } catch (err) {
    console.error('PUT /api/projects/[id]/design failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to update design' },
      { status: 500 },
    );
  }
}

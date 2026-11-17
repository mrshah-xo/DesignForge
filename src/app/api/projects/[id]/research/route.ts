// ============================================================
// POST /api/projects/[id]/research — start async research job
// GET  /api/projects/[id]/research?jobId= — poll job status
// PUT  /api/projects/[id]/research — user review (edit/approve)
//
// Real web search + LLM synthesis can take 20-90s, longer than
// the preview gateway allows a single request to run. POST
// returns a job id immediately while the pipeline runs in the
// background; the frontend polls GET until done.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { AudienceData, AnalysisData, ResearchData } from '@/lib/types';
import { db } from '@/lib/db';
import { llmJson, webSearch } from '@/lib/server/ai';
import { RESEARCH_SYSTEM, buildResearchPrompt } from '@/lib/server/prompts';
import {
  normalizeResearchSections,
  normalizeSources,
  parseAnalysisRow,
  parseAudienceRow,
  parseResearchRow,
} from '@/lib/server/export';
import { createJob, finishJob, findRunningJob, getJob, publicJob } from '@/lib/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SEARCH_RESULTS = 15;

// ---------- Background pipeline ----------

/** Research pipeline: 3 parallel web searches + LLM synthesis, persisted to DB. */
async function runResearchPipeline(id: string, jobId: string): Promise<void> {
  try {
    const project = await db.project.findUnique({
      where: { id },
      include: { analysis: true, audience: true },
    });
    const analysis: AnalysisData | null = project ? parseAnalysisRow(project.analysis) : null;
    const audience: AudienceData | null = project ? parseAudienceRow(project.audience) : null;
    if (!project || !analysis || !audience) {
      throw new Error('Project prerequisites changed — complete analysis and audience steps first');
    }

    // 1. Real internet research: 3 parallel queries, dedupe, cap 15.
    const queries = [
      `"${audience.categoryLabel}" app design trust psychology`,
      `${audience.categoryLabel} UI design patterns trusted brands`,
      `color psychology trust ${audience.trustNeed} need digital products`,
    ];
    const settled = await Promise.allSettled(
      queries.map((query) => webSearch(query, 5)),
    );
    const searchResults: Array<{ name: string; url: string; snippet: string }> = [];
    const seenUrls = new Set<string>();
    for (const result of settled) {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value)) continue;
      for (const item of result.value) {
        if (!item?.url || seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        searchResults.push({
          name: typeof item.name === 'string' ? item.name : '',
          url: item.url,
          snippet: typeof item.snippet === 'string' ? item.snippet : '',
        });
        if (searchResults.length >= MAX_SEARCH_RESULTS) break;
      }
      if (searchResults.length >= MAX_SEARCH_RESULTS) break;
    }

    // 2. LLM research synthesis.
    const raw = await llmJson<Record<string, unknown>>(
      RESEARCH_SYSTEM,
      buildResearchPrompt(project, audience, analysis, searchResults),
    );

    // 3. Fill missing sections/sources with safe fallbacks.
    const rawSections = (raw.sections && typeof raw.sections === 'object' ? raw.sections : raw) as unknown;
    const sections = normalizeResearchSections(rawSections);
    const sources = normalizeSources(raw.sources);

    // 4. Upsert ResearchReport (new research always needs review again).
    const record = {
      status: 'needs_review',
      sections: JSON.stringify(sections),
      sources: JSON.stringify(sources),
      reviewedAt: null,
    };
    await db.$transaction([
      db.researchReport.upsert({
        where: { projectId: id },
        update: record,
        create: { projectId: id, ...record },
      }),
      db.project.update({ where: { id }, data: { status: 'research_review' } }),
    ]);

    finishJob(jobId, 'done');
  } catch (err) {
    console.error(`POST /api/projects/[id]/research pipeline failed for ${id}:`, err);
    finishJob(jobId, 'error', err instanceof Error ? err.message : 'Research generation failed');
  }
}

// ---------- POST: start research (returns immediately) ----------

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await db.project.findUnique({
      where: { id },
      include: { analysis: true, audience: true },
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }
    const analysis = parseAnalysisRow(project.analysis);
    const audience = parseAudienceRow(project.audience);
    if (!analysis || !audience) {
      return NextResponse.json(
        { ok: false, error: 'Complete analysis and audience steps first' },
        { status: 409 },
      );
    }

    // Reuse an in-flight run instead of stacking duplicates.
    const running = findRunningJob(id, 'research');
    if (running) {
      return NextResponse.json({ ok: true, data: { job: publicJob(running) } });
    }

    const job = createJob('research', id);
    void runResearchPipeline(id, job.id);
    return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
  } catch (err) {
    console.error('POST /api/projects/[id]/research failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not start research' },
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

    if (job.status !== 'done') {
      return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
    }

    // Done — return the fresh research from the DB.
    const project = await db.project.findUnique({ where: { id }, include: { research: true } });
    const research = parseResearchRow(project?.research ?? null);
    if (!research) {
      return NextResponse.json(
        { ok: false, error: 'Generation finished but no research was saved' },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, data: { job: publicJob(job), research } });
  } catch (err) {
    console.error('GET /api/projects/[id]/research failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not check research status' },
      { status: 500 },
    );
  }
}

// ---------- PUT: user review — edit sections/sources, approve ----------

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await db.project.findUnique({ where: { id }, include: { research: true } });
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const approve = body.approve === true;
    const hasSections = Boolean(
      body.sections && typeof body.sections === 'object' && !Array.isArray(body.sections),
    );
    const hasSources = Array.isArray(body.sources);
    if (!approve && !hasSections && !hasSources) {
      return NextResponse.json(
        { ok: false, error: 'Provide sections, sources, or approve: true' },
        { status: 400 },
      );
    }
    if (approve && !hasSections) {
      return NextResponse.json(
        { ok: false, error: 'Cannot approve research without providing sections' },
        { status: 400 },
      );
    }

    const existing = project.research;
    const existingSections = existing ? (JSON.parse(existing.sections) as unknown) : {};
    const existingSources = existing ? (JSON.parse(existing.sources) as unknown) : [];

    // Merge provided sections over existing ones (partial updates supported).
    const mergedRawSections = hasSections
      ? { ...(existingSections as object), ...(body.sections as object) }
      : existingSections;
    const sections = normalizeResearchSections(mergedRawSections);
    const sources = hasSources ? normalizeSources(body.sources) : normalizeSources(existingSources);

    const status = approve ? 'approved' : (existing?.status ?? 'needs_review');
    const reviewedAt = approve ? new Date() : (existing?.reviewedAt ?? null);

    const record = {
      status,
      sections: JSON.stringify(sections),
      sources: JSON.stringify(sources),
      reviewedAt,
    };
    await db.researchReport.upsert({
      where: { projectId: id },
      update: record,
      create: { projectId: id, ...record },
    });

    const research: ResearchData = {
      status,
      sections,
      sources,
      reviewedAt: reviewedAt ? new Date(reviewedAt).toISOString() : null,
    };
    return NextResponse.json({ ok: true, data: { research } });
  } catch (err) {
    console.error('PUT /api/projects/[id]/research failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to update research' },
      { status: 500 },
    );
  }
}

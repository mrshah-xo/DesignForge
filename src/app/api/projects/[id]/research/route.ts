// ============================================================
// POST /api/projects/[id]/research - start async research job
// GET  /api/projects/[id]/research?jobId= - poll job status
// PUT  /api/projects/[id]/research - user review (edit/approve)
//
// Real web search + LLM synthesis can take 20-90s, longer than
// the preview gateway allows a single request to run. POST
// returns a job id immediately while the pipeline runs in the
// background; the frontend polls GET until done.
// ============================================================

import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import type { AudienceData, AnalysisData, ResearchData } from '@/lib/types';
import { db } from '@/lib/db';
import {
  assertAiUsable,
  isMissingUserKey,
  llmJson,
  userKeyFromRequest,
  webSearch,
} from '@/lib/server/ai';
import { RESEARCH_SYSTEM, buildResearchPrompt } from '@/lib/server/prompts';
import { buildFallbackResearch } from '@/lib/server/research-fallback';
import {
  normalizeResearchSections,
  normalizeSources,
  parseAnalysisRow,
  parseAudienceRow,
  parseResearchRow,
} from '@/lib/server/export';
import {
  createJob,
  findFreshDbRunningJob,
  findRunningJob,
  finishJob,
  getDbJob,
  getJob,
  jobStartTs,
  JOB_HEARTBEAT_STALE_MS,
  persistNewJob,
  publicJob,
  setJobProgress,
  syntheticJob,
  JOB_TS_SKEW_MS,
  STALE_JOB_MS,
} from '@/lib/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel: with `after()` the pipeline keeps the invocation alive past the
// response; this must fit inside the platform duration cap (Fluid Hobby: 300s).
export const maxDuration = 90;

const MAX_SEARCH_RESULTS = 15;
/** A DB 'generating' marker newer than this is still considered in-flight. */
const GENERATING_FRESH_MS = 4 * 60 * 1000;
/**
 * Wall-clock budget for the research pipeline. maxDuration is 90s on Vercel;
 * leaving ~20s of headroom means the offline research fallback still gets
 * saved (step 4 completes) even when the provider is crawling.
 */
const PIPELINE_BUDGET_MS = 70 * 1000;

// ---------- Background pipeline ----------

/** Research pipeline: 3 parallel web searches + LLM synthesis, persisted to DB. */
async function runResearchPipeline(id: string, jobId: string, userKey: string | null): Promise<void> {
  const t0 = Date.now();
  try {
    setJobProgress(jobId, 'Reading your audience brief…');
    const project = await db.project.findUnique({
      where: { id },
      include: { analysis: true, audience: true },
    });
    const analysis: AnalysisData | null = project ? parseAnalysisRow(project.analysis) : null;
    const audience: AudienceData | null = project ? parseAudienceRow(project.audience) : null;
    if (!project || !analysis || !audience) {
      throw new Error('Project prerequisites changed - complete analysis and audience steps first');
    }

    // 1. Real internet research: 3 parallel queries, dedupe, cap 15.
    const queries = [
      `"${audience.categoryLabel}" app design trust psychology`,
      `${audience.categoryLabel} UI design patterns trusted brands`,
      `color psychology trust ${audience.trustNeed} need digital products`,
    ];
    const settled = await Promise.allSettled(
      queries.map(async (query, index) => {
        // Small stagger avoids tripping per-second gateway rate limits
        // (429s) that three identical parallel calls can trigger. It also
        // spaces the progress updates so the UI shows each real query fire.
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, index * 300));
        setJobProgress(jobId, `Searching the web: "${query}"`);
        return webSearch(query, 5, userKey);
      }),
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

    // 2. LLM research synthesis - with an offline fallback when the AI
    //    service is unavailable (empty responses, rate limits, quota) or the
    //    time budget is spent, so step 4 never dead-ends.
    setJobProgress(
      jobId,
      `Found ${searchResults.length} sources - synthesizing your research report…`,
    );
    let raw: Record<string, unknown>;
    const budgetLeft = PIPELINE_BUDGET_MS - (Date.now() - t0);
    if (budgetLeft < 20_000) {
      console.warn(`Research pipeline out of time budget for ${id}; using offline research fallback`);
      raw = buildFallbackResearch(audience, analysis, searchResults) as Record<string, unknown>;
    } else {
      try {
        raw = await llmJson<Record<string, unknown>>(
          RESEARCH_SYSTEM,
          buildResearchPrompt(project, audience, analysis, searchResults),
          3,
          8000,
          userKey,
          (attempt, attempts) => {
            setJobProgress(
              jobId,
              attempt === 1
                ? `Synthesizing research from ${searchResults.length} sources…`
                : `Synthesizing research (retry ${attempt}/${attempts})…`,
            );
          },
        );
      } catch (llmErr) {
        console.error(`Research LLM synthesis failed for ${id}; using offline research fallback:`, llmErr);
        raw = buildFallbackResearch(audience, analysis, searchResults) as Record<string, unknown>;
      }
    }

    // 3. Fill missing sections/sources with safe fallbacks.
    const rawSections = (raw.sections && typeof raw.sections === 'object' ? raw.sections : raw) as unknown;
    const sections = normalizeResearchSections(rawSections);
    const sources = normalizeSources(raw.sources);

    setJobProgress(jobId, 'Saving your research report…');

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
    const message = err instanceof Error ? err.message : 'Research generation failed';
    console.error(`POST /api/projects/[id]/research pipeline failed for ${id}:`, err);
    finishJob(jobId, 'error', message);
    // Persist the failure so polls on OTHER serverless instances see it too.
    try {
      await db.researchReport.updateMany({ where: { projectId: id, status: 'generating' }, data: { status: 'error' } });
    } catch (persistErr) {
      console.error(`Could not persist research error state for ${id}:`, persistErr);
    }
  }
}

// ---------- POST: start research (returns immediately) ----------

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Visitor's own key (BYOK) - captured here at request time and passed
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
    // Cross-instance / post-restart dedupe: a fresh durable job row means
    // another instance is already running the pipeline. Return the ORIGINAL
    // job id so the client's polls pick up the live progress mirror. The old
    // ResearchReport 'generating' marker is deliberately NOT used for dedupe
    // here - after a restart it would block re-runs for up to 4 minutes even
    // though no runner is alive; the mirror's heartbeat cannot lie.
    const dbRunning = await findFreshDbRunningJob(id, 'research');
    if (dbRunning) {
      return NextResponse.json({
        ok: true,
        data: { job: syntheticJob(dbRunning.id, 'research', id, 'running', null, dbRunning.progress) },
      });
    }

    const job = createJob('research', id);
    // Durable mirror: other instances (and polls after a restart) read the
    // real status/progress from this row instead of guessing.
    await persistNewJob(job);
    // Persist a 'generating' marker (preserving any existing report content)
    // so polls on other instances know a run is in flight.
    if (project.research) {
      await db.researchReport.update({ where: { projectId: id }, data: { status: 'generating' } });
    } else {
      await db.researchReport.create({
        data: { projectId: id, status: 'generating', sections: '[]', sources: '[]' },
      });
    }

    // BYOK gate: reject before starting when no usable credentials exist.
    await assertAiUsable(userKey);

    // `after()` keeps the serverless invocation alive past the POST response
    // (no-op overhead on long-lived servers like the preview dev environment).
    after(() => runResearchPipeline(id, job.id, userKey));
    return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
  } catch (err) {
    console.error('POST /api/projects/[id]/research failed:', err);
    const missing = isMissingUserKey(err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not start research',
        ...(missing ? { requiresUserKey: true } : {}),
      },
      { status: missing ? 401 : 500 },
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
    if (job && job.projectId === id) {
      if (job.status !== 'done') {
        return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
      }
      return NextResponse.json({ ok: true, data: await donePayload(id, job.id) });
    }

    // Serverless fallback: this instance never saw the in-memory job.
    // Derive the state from DB markers instead of failing with 404.
    return NextResponse.json({ ok: true, data: await fallbackJobPayload(id, jobId) });
  } catch (err) {
    console.error('GET /api/projects/[id]/research failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not check research status' },
      { status: 500 },
    );
  }
}

/** Done payload shared by the in-memory fast path and the DB fallback. */
async function donePayload(
  id: string,
  jobId: string,
): Promise<{ job: ReturnType<typeof publicJob>; research: ResearchData }> {
  const project = await db.project.findUnique({ where: { id }, include: { research: true } });
  const research = parseResearchRow(project?.research ?? null);
  if (!research) {
    throw new Error('Generation finished but no research was saved');
  }
  return { job: syntheticJob(jobId, 'research', id, 'done'), research };
}

/**
 * Reconstruct job state from the durable mirror (and the ResearchReport row)
 * when the in-memory job is unavailable (poll landed on a different
 * serverless instance, or the server restarted mid-run).
 */
async function fallbackJobPayload(
  id: string,
  jobId: string,
): Promise<{ job: ReturnType<typeof publicJob>; research?: ResearchData }> {
  const startTs = jobStartTs(jobId);
  const project = await db.project.findUnique({ where: { id }, include: { research: true } });
  const row = project?.research ?? null;

  // 1. Durable job mirror - the source of truth across instances/restarts.
  const dbJob = await getDbJob(jobId);
  if (dbJob && dbJob.projectId === id) {
    if (dbJob.status === 'done') {
      const research = row ? parseResearchRow(row) : null;
      if (research && row?.status !== 'generating' && row?.status !== 'error') {
        return { job: syntheticJob(jobId, 'research', id, 'done'), research };
      }
    } else if (dbJob.status === 'error') {
      return {
        job: syntheticJob(jobId, 'research', id, 'error', dbJob.error ?? 'Research generation failed. Run it again.'),
      };
    } else {
      // Running - but only trust it while the heartbeat is fresh.
      if (Date.now() - dbJob.updatedAt.getTime() < JOB_HEARTBEAT_STALE_MS) {
        return {
          job: syntheticJob(jobId, 'research', id, 'running', null, dbJob.progress),
        };
      }
      return {
        job: syntheticJob(
          jobId,
          'research',
          id,
          'error',
          'Research was interrupted before it finished (often a deployment time limit). Run it again - it usually completes on the first try now.',
        ),
      };
    }
  }

  // 2. Legacy DB markers on the ResearchReport row (pre-mirror runs).
  if (row) {
    const updated = row.updatedAt.getTime();
    if (row.status === 'generating') {
      if (Date.now() - updated < GENERATING_FRESH_MS) {
        return { job: syntheticJob(jobId, 'research', id, 'running') };
      }
      return {
        job: syntheticJob(
          jobId,
          'research',
          id,
          'error',
          'Research was interrupted before it finished (often a deployment time limit). Run it again, or use the free "Want a prompt?" flow, which always works.',
        ),
      };
    }
    if (row.status === 'error') {
      return {
        job: syntheticJob(
          jobId,
          'research',
          id,
          'error',
          'The last research run failed. Run it again, or use the free "Want a prompt?" flow, which always works.',
        ),
      };
    }
    if (startTs !== null && updated >= startTs - JOB_TS_SKEW_MS) {
      // The pipeline completed on another instance and saved the report.
      const research = parseResearchRow(row);
      if (research) return { job: syntheticJob(jobId, 'research', id, 'done'), research };
    }
  }

  if (startTs === null || Date.now() - startTs > STALE_JOB_MS) {
    return {
      job: syntheticJob(
        jobId,
        'research',
        id,
        'error',
        'Research status could not be tracked to completion. Run it again, or use the free "Want a prompt?" flow.',
      ),
    };
  }
  return { job: syntheticJob(jobId, 'research', id, 'running') };
}

// ---------- PUT: user review - edit sections/sources, approve ----------

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

    // Generative states never survive a user edit: providing content means
    // the report is back in normal review flow.
    const base = existing?.status ?? 'needs_review';
    const status = approve
      ? 'approved'
      : base === 'error' || base === 'generating'
        ? 'needs_review'
        : base;
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

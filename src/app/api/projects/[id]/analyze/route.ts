// ============================================================
// POST /api/projects/[id]/analyze — start async VLM analysis job
// GET  /api/projects/[id]/analyze?jobId= — poll job status
//
// Vision analysis (VLM + pixel palette merge) can take 15-60s+.
// POST returns a job id immediately while the pipeline runs in
// the background; the frontend polls GET until done. Deletes any
// derived DesignSpec on completion.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { PaletteColor } from '@/lib/types';
import { db } from '@/lib/db';
import { visionJson } from '@/lib/server/ai';
import { ANALYSIS_SYSTEM, buildAnalysisPrompt } from '@/lib/server/prompts';
import {
  colorNameFromHex,
  extractPixelColors,
  hexToRgb,
  normalizeLogo,
  rgbDistance,
} from '@/lib/server/logo-image';
import { createJob, finishJob, findRunningJob, getJob, publicJob } from '@/lib/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function normalizeVlmPalette(raw: unknown): PaletteColor[] {
  if (!Array.isArray(raw)) return [];
  const out: PaletteColor[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.hex !== 'string' || !HEX_RE.test(e.hex.trim())) continue;
    const hex = e.hex.trim();
    const weightNum = Number(e.weight);
    out.push({
      hex,
      name: str(e.name) ?? colorNameFromHex(hex),
      weight: Number.isFinite(weightNum) ? Math.max(0, Math.min(100, Math.round(weightNum))) : 20,
    });
  }
  return out.slice(0, 10);
}

// ---------- Background pipeline ----------

/** Analysis pipeline: VLM + deterministic pixel palette merge, persisted to DB. */
async function runAnalysisPipeline(id: string, jobId: string): Promise<void> {
  try {
    const project = await db.project.findUnique({ where: { id } });
    if (!project) {
      throw new Error('Project not found');
    }

    // 1. Normalize the logo into a clean PNG for the VLM.
    const { base64 } = await normalizeLogo(project.logoData);

    // 2. VLM analysis (non-fatal: pixel palette + fallbacks keep the pipeline alive).
    let vlm: Record<string, unknown> = {};
    try {
      vlm = await visionJson<Record<string, unknown>>(
        `${ANALYSIS_SYSTEM}\n\n${buildAnalysisPrompt(project.name, project.description)}`,
        base64,
      );
    } catch (err) {
      console.error(`VLM analysis failed for project ${id}:`, err instanceof Error ? err.message : err);
    }

    // 3. Deterministic pixel palette.
    const pixelPalette = await extractPixelColors(project.logoData);
    const vlmPalette = normalizeVlmPalette(vlm.palette);

    // 4. Merge: pixel entries adopt near VLM names; extra VLM colors appended.
    const merged: PaletteColor[] = pixelPalette.map((p) => {
      const near = vlmPalette.find(
        (v) => rgbDistance(hexToRgb(p.hex), hexToRgb(v.hex)) < 60 && v.name.length > 0,
      );
      return near ? { ...p, name: near.name } : p;
    });
    for (const v of vlmPalette) {
      const isClose = merged.some((m) => rgbDistance(hexToRgb(m.hex), hexToRgb(v.hex)) < 60);
      if (!isClose) merged.push({ hex: v.hex, name: v.name, weight: 20 });
    }
    const palette = merged.slice(0, 8).sort((a, b) => b.weight - a.weight);

    // 5. Build AnalysisData with safe fallbacks.
    const styleTags = (Array.isArray(vlm.styleTags) ? vlm.styleTags : [])
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim())
      .filter((t, i, arr) => arr.indexOf(t) === i)
      .slice(0, 8);
    const trustSignals = (Array.isArray(vlm.trustSignals) ? vlm.trustSignals : [])
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim())
      .slice(0, 6);
    const rawTemperature = str(vlm.temperature)?.toLowerCase();
    const temperature = ['warm', 'cool', 'neutral'].includes(rawTemperature ?? '')
      ? rawTemperature!
      : 'neutral';

    const analysis = {
      palette: palette.length
        ? palette
        : [{ hex: '#71717A', name: 'Neutral Gray', weight: 100 }],
      styleTags,
      mood: str(vlm.mood) ?? 'Neutral and modern',
      temperature,
      industry: str(vlm.industry) ?? 'General',
      audienceGuess: str(vlm.audienceGuess) ?? 'General audience',
      trustSignals,
      description: str(vlm.description) ?? '',
    };

    // 6. Upsert analysis + invalidate derived design + advance status.
    const record = {
      palette: JSON.stringify(analysis.palette),
      styleTags: JSON.stringify(analysis.styleTags),
      mood: analysis.mood,
      temperature: analysis.temperature,
      industry: analysis.industry,
      audienceGuess: analysis.audienceGuess,
      trustSignals: JSON.stringify(analysis.trustSignals),
      description: analysis.description,
    };
    await db.$transaction([
      db.logoAnalysis.upsert({
        where: { projectId: id },
        update: record,
        create: { projectId: id, ...record },
      }),
      db.designSpec.deleteMany({ where: { projectId: id } }),
      db.project.update({ where: { id }, data: { status: 'analyzed' } }),
    ]);

    finishJob(jobId, 'done');
  } catch (err) {
    console.error(`POST /api/projects/[id]/analyze pipeline failed for ${id}:`, err);
    finishJob(jobId, 'error', err instanceof Error ? err.message : 'Logo analysis failed');
  }
}

// ---------- POST: start analysis (returns immediately) ----------

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const exists = await db.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    // Reuse an in-flight run instead of stacking duplicates.
    const running = findRunningJob(id, 'analyze');
    if (running) {
      return NextResponse.json({ ok: true, data: { job: publicJob(running) } });
    }

    const job = createJob('analyze', id);
    void runAnalysisPipeline(id, job.id);
    return NextResponse.json({ ok: true, data: { job: publicJob(job) } });
  } catch (err) {
    console.error('POST /api/projects/[id]/analyze failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not start logo analysis' },
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

    // Done — return the fresh analysis from the DB.
    const project = await db.project.findUnique({ where: { id }, include: { analysis: true } });
    if (!project || !project.analysis) {
      return NextResponse.json(
        { ok: false, error: 'Generation finished but no analysis was saved' },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      data: {
        job: publicJob(job),
        analysis: {
          palette: JSON.parse(project.analysis.palette) as PaletteColor[],
          styleTags: JSON.parse(project.analysis.styleTags) as string[],
          mood: project.analysis.mood,
          temperature: project.analysis.temperature,
          industry: project.analysis.industry,
          audienceGuess: project.analysis.audienceGuess,
          trustSignals: JSON.parse(project.analysis.trustSignals) as string[],
          description: project.analysis.description,
        },
      },
    });
  } catch (err) {
    console.error('GET /api/projects/[id]/analyze failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not check analysis status' },
      { status: 500 },
    );
  }
}

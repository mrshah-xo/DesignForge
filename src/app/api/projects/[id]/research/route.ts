// ============================================================
// POST /api/projects/[id]/research — web search + LLM research
// PUT  /api/projects/[id]/research — user review (edit/approve)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { AudienceData, AnalysisData, ResearchData } from '@/lib/types';
import { db } from '@/lib/db';
import { getZAI, llmJson } from '@/lib/server/ai';
import { RESEARCH_SYSTEM, buildResearchPrompt } from '@/lib/server/prompts';
import {
  normalizeResearchSections,
  normalizeSources,
  parseAnalysisRow,
  parseAudienceRow,
} from '@/lib/server/export';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_SEARCH_RESULTS = 15;

// ---------- POST: run the research pipeline ----------

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
    const analysis: AnalysisData | null = parseAnalysisRow(project.analysis);
    const audience: AudienceData | null = parseAudienceRow(project.audience);
    if (!analysis || !audience) {
      return NextResponse.json(
        { ok: false, error: 'Complete analysis and audience steps first' },
        { status: 409 },
      );
    }

    // 1. Real internet research: 3 parallel queries, dedupe, cap 15.
    const queries = [
      `"${audience.categoryLabel}" app design trust psychology`,
      `${audience.categoryLabel} UI design patterns trusted brands`,
      `color psychology trust ${audience.trustNeed} need digital products`,
    ];
    const zai = await getZAI();
    const settled = await Promise.allSettled(
      queries.map((query) => zai.functions.invoke('web_search', { query, num: 5 })),
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

    const research: ResearchData = {
      status: 'needs_review',
      sections,
      sources,
      reviewedAt: null,
    };
    return NextResponse.json({ ok: true, data: { research } });
  } catch (err) {
    console.error('POST /api/projects/[id]/research failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Research generation failed' },
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

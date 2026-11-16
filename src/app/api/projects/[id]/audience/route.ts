// ============================================================
// POST /api/projects/[id]/audience — save audience profile.
// Deletes derived ResearchReport + DesignSpec (inputs changed).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { AudienceData } from '@/lib/types';
import { CATEGORIES, MONETIZATION, PLATFORMS, TRUST_LEVELS } from '@/lib/types';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await db.project.findUnique({
      where: { id },
      include: { research: true, design: true },
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    // --- category ---
    const category = CATEGORIES.find((c) => c.value === body.category);
    if (!category) {
      return NextResponse.json(
        { ok: false, error: `category must be one of: ${CATEGORIES.map((c) => c.value).join(', ')}` },
        { status: 400 },
      );
    }

    // --- audienceDesc ---
    if (typeof body.audienceDesc !== 'string' || !body.audienceDesc.trim()) {
      return NextResponse.json(
        { ok: false, error: 'audienceDesc is required and must be a non-empty string' },
        { status: 400 },
      );
    }
    const audienceDesc = body.audienceDesc.trim().slice(0, 2000);

    // --- platform / monetization / trustNeed enums ---
    if (!PLATFORMS.some((p) => p.value === body.platform)) {
      return NextResponse.json(
        { ok: false, error: `platform must be one of: ${PLATFORMS.map((p) => p.value).join(', ')}` },
        { status: 400 },
      );
    }
    if (!MONETIZATION.some((m) => m.value === body.monetization)) {
      return NextResponse.json(
        {
          ok: false,
          error: `monetization must be one of: ${MONETIZATION.map((m) => m.value).join(', ')}`,
        },
        { status: 400 },
      );
    }
    if (!TRUST_LEVELS.some((t) => t.value === body.trustNeed)) {
      return NextResponse.json(
        { ok: false, error: `trustNeed must be one of: ${TRUST_LEVELS.map((t) => t.value).join(', ')}` },
        { status: 400 },
      );
    }

    const audience: AudienceData = {
      category: category.value,
      categoryLabel: category.label,
      audienceDesc,
      platform: body.platform as string,
      monetization: body.monetization as string,
      trustNeed: body.trustNeed as string,
      notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 4000) : '',
    };

    const record = {
      category: audience.category,
      categoryLabel: audience.categoryLabel,
      audienceDesc: audience.audienceDesc,
      platform: audience.platform,
      monetization: audience.monetization,
      trustNeed: audience.trustNeed,
      notes: audience.notes,
    };

    await db.$transaction([
      db.audienceProfile.upsert({
        where: { projectId: id },
        update: record,
        create: { projectId: id, ...record },
      }),
      // Inputs changed → derived data is invalidated.
      db.researchReport.deleteMany({ where: { projectId: id } }),
      db.designSpec.deleteMany({ where: { projectId: id } }),
      db.project.update({ where: { id }, data: { status: 'audience_saved' } }),
    ]);

    return NextResponse.json({ ok: true, data: { audience } });
  } catch (err) {
    console.error('POST /api/projects/[id]/audience failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to save audience' },
      { status: 500 },
    );
  }
}

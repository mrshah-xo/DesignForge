// ============================================================
// GET /api/projects/[id] — full project detail incl. relations
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toProjectDetail } from '@/lib/server/export';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await db.project.findUnique({
      where: { id },
      include: { analysis: true, audience: true, research: true, design: true, themes: true },
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: toProjectDetail(project) });
  } catch (err) {
    console.error(`GET /api/projects/[id] failed:`, err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load project' },
      { status: 500 },
    );
  }
}

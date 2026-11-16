// ============================================================
// POST /api/projects — create project from multipart logo upload
// GET  /api/projects — list projects (createdAt desc)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toProjectSummary } from '@/lib/server/export';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIMES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export async function GET() {
  try {
    const projects = await db.project.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ ok: true, data: { projects: projects.map(toProjectSummary) } });
  } catch (err) {
    console.error('GET /api/projects failed:', err);
    return NextResponse.json({ ok: false, error: 'Failed to list projects' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { ok: false, error: 'Expected multipart/form-data with fields "file", "name"' },
        { status: 400 },
      );
    }

    // --- name ---
    const nameRaw = form.get('name');
    if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
      return NextResponse.json({ ok: false, error: 'Project name is required' }, { status: 400 });
    }
    const name = nameRaw.trim();
    if (name.length > 80) {
      return NextResponse.json(
        { ok: false, error: 'Project name must be 1-80 characters' },
        { status: 400 },
      );
    }

    // --- description (optional) ---
    const descriptionRaw = form.get('description');
    const description =
      typeof descriptionRaw === 'string' ? descriptionRaw.trim().slice(0, 1000) : '';

    // --- file ---
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Logo file is required (field "file")' },
        { status: 400 },
      );
    }
    // Some browsers send image/jpg — normalize to the canonical mime.
    const mime = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
    if (!ALLOWED_MIMES[mime]) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported logo format "${file.type || 'unknown'}". Allowed: ${Object.keys(ALLOWED_MIMES).join(', ')}`,
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Logo file exceeds the 5MB limit' },
        { status: 400 },
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Logo file is empty' }, { status: 400 });
    }
    if (bytes.length > MAX_LOGO_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Logo file exceeds the 5MB limit' },
        { status: 400 },
      );
    }

    const logoData = `data:${mime};base64,${bytes.toString('base64')}`;
    const project = await db.project.create({
      data: { name, description, logoData, logoMime: mime, status: 'uploaded' },
    });

    return NextResponse.json({ ok: true, data: toProjectSummary(project) }, { status: 201 });
  } catch (err) {
    console.error('POST /api/projects failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to create project' },
      { status: 500 },
    );
  }
}

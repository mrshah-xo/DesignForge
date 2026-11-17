// ============================================================
// POST /api/projects/[id]/analyze — VLM logo analysis + pixel
// palette merge. Deletes any derived DesignSpec.
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

export const runtime = 'nodejs';
export const maxDuration = 300;

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

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await db.project.findUnique({ where: { id }, include: { design: true } });
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    // 1. Normalize the logo into a clean PNG for the VLM.
    const { base64 } = await normalizeLogo(project.logoData);

    // 2. VLM analysis (non-fatal: pixel palette + fallbacks keep the request alive).
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

    return NextResponse.json({ ok: true, data: { analysis } });
  } catch (err) {
    console.error('POST /api/projects/[id]/analyze failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Logo analysis failed' },
      { status: 500 },
    );
  }
}

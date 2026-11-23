// ============================================================
// GET /api/projects/[id]/export?format=json - full export JSON
// GET /api/projects/[id]/export (or ?format=zip) - .zip download
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  buildBrandSheetSvg,
  buildExportZip,
  buildMetadataJson,
  logoBase64,
  parseDesignRow,
  slugifyProjectName,
} from '@/lib/server/export';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await db.project.findUnique({
      where: { id },
      include: { analysis: true, audience: true, research: true, design: true },
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }
    if (!project.design) {
      return NextResponse.json(
        { ok: false, error: 'Generate a design before exporting' },
        { status: 409 },
      );
    }

    const design = parseDesignRow(project.design)!;
    const format = req.nextUrl.searchParams.get('format');

    // ---------- JSON export ----------
    if (format === 'json') {
      return NextResponse.json({
        ok: true,
        data: {
          design_md: design.markdown,
          tokens: design.tokens,
          metadata: buildMetadataJson(project, project.audience, project.analysis, project.research, project.design),
          logo_base64: logoBase64(project.logoData),
          logo_mime: project.logoMime,
          brand_sheet_svg: buildBrandSheetSvg(design.tokens),
        },
      });
    }

    // ---------- .zip download (default) ----------
    const zipBuffer = await buildExportZip(
      project,
      project.design,
      project.audience,
      project.analysis,
      project.research,
    );
    const filename = `${slugifyProjectName(project.name)}-design-package.zip`;
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (err) {
    console.error('GET /api/projects/[id]/export failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 },
    );
  }
}

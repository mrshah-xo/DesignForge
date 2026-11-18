// ============================================================
// POST /api/parse-brief — extract a design brief from free-form
// text (usually an AI AI assistant's reply) when the tolerant
// local parser finds nothing. LLM fallback for the "Want a
// prompt?" flow on the landing page.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { llmJson } from '@/lib/server/ai';
import { PARSE_BRIEF_MAX_CHARS, normalizeBriefRaw } from '@/lib/brief';

export const runtime = 'nodejs';
export const maxDuration = 120;

const EXTRACTION_SYSTEM = `You are a precise data-extraction engine for DesignForge, a tool that turns a logo plus brand info into a design system.

From the user's text (usually an AI agent's reply describing a product), extract the design brief fields.
Return ONLY a JSON object with exactly these keys (use null when the text does not clearly provide the value):
{
  "name": "project or product name, or null",
  "description": "1-2 sentence description of what it is, or null",
  "category": "fintech|ecommerce|health|saas|education|social|gaming|realestate|food|other, or null",
  "audienceDesc": "specific description of who will use it, or null",
  "platform": "web|mobile|both, or null",
  "monetization": "free|subscription|one_time|per_use|marketplace, or null",
  "trustNeed": "low|medium|high|critical, or null",
  "notes": "extra design-research notes, or null"
}

Guidance:
- category: fintech=payments/banking/wallets/crypto/lending; ecommerce=online shops/marketplaces/D2C; health=medical/fitness/mental wellness; saas=B2B tools/dashboards/dev tools/productivity; education=courses/edtech/tutoring; social=networks/forums/messaging/dating; gaming=games/streaming/entertainment; realestate=property/rentals/proptech; food=restaurants/delivery/grocery; other=anything that fits none of these.
- platform: web=website/web app/desktop; mobile=phone app (iOS/Android); both=cross-platform.
- monetization: free=free or ad-supported; subscription=recurring payments; one_time=one-time purchase/lifetime; per_use=pay per use/commission/transaction fees; marketplace=handles other people's money.
- trustNeed: critical=users pay or money moves; high=sensitive personal data; medium=personal data; low=casual use, nothing sensitive.
- Never invent facts. Copy the user's own wording for descriptions and audience. Return JSON only, no commentary.`;

export async function POST(req: NextRequest) {
  try {
    let body: { text?: unknown };
    try {
      body = (await req.json()) as { text?: unknown };
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
    }
    if (text.length > PARSE_BRIEF_MAX_CHARS) {
      return NextResponse.json(
        { ok: false, error: `text is too long (max ${PARSE_BRIEF_MAX_CHARS} characters)` },
        { status: 400 },
      );
    }

    const raw = await llmJson<unknown>(EXTRACTION_SYSTEM, text.slice(0, 8000), 2);
    const brief = normalizeBriefRaw(raw);

    return NextResponse.json({ ok: true, data: { brief } });
  } catch (err) {
    console.error('POST /api/parse-brief failed:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not extract the brief',
      },
      { status: 500 },
    );
  }
}

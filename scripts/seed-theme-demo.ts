// One-off seed: creates a demo project with analysis + audience +
// approved research + design so the design-step theme switcher can be
// browser-tested without running the full AI pipeline first.
// Usage: bun scripts/seed-theme-demo.ts
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const SECTION = (title: string, bullets: string[]) =>
  JSON.stringify({ title, body: bullets[0], bullets: bullets.slice(1) });

async function main() {
  const existing = await db.project.findFirst({ where: { name: 'Theme Demo' } });
  if (existing) {
    await db.project.delete({ where: { id: existing.id } });
  }

  const project = await db.project.create({
    data: {
      name: 'Theme Demo',
      description: 'A budgeting app for young families',
      // 1x1 png
      logoData:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      logoMime: 'image/png',
      status: 'design_ready',
      analysis: {
        create: {
          palette: JSON.stringify([
            { hex: '#0F766E', name: 'Deep Teal', weight: 62 },
            { hex: '#F59E0B', name: 'Warm Amber', weight: 24 },
            { hex: '#1C1917', name: 'Ink', weight: 14 },
          ]),
          styleTags: JSON.stringify(['flat', 'minimal', 'geometric', 'rounded']),
          mood: 'Calm, trustworthy, modern',
          temperature: 'cool',
          industry: 'Fintech / personal finance',
          audienceGuess: 'Young families planning budgets',
          trustSignals: JSON.stringify(['balanced geometry', 'sober palette', 'clear wordmark']),
          description: 'A minimal geometric wordmark with a teal shield motif and rounded terminals.',
        },
      },
      audience: {
        create: {
          category: 'fintech',
          categoryLabel: 'Fintech / Payments',
          audienceDesc: 'Parents aged 28-40 managing household budgets and savings goals',
          platform: 'both',
          monetization: 'subscription',
          trustNeed: 'critical',
          notes: 'Money safety is the top concern',
        },
      },
      research: {
        create: {
          status: 'approved',
          reviewedAt: new Date(),
          sections: JSON.stringify({
            audiencePsychology: SECTION('Audience Psychology', [
              'Budgeting parents fear losing control of money more than losing features.',
              'They respond to calm, orderly interfaces that signal discipline.',
              'Progress visualizations reduce anxiety about long-term goals.',
              'Peer proof from other families builds credibility fast.',
              'Jargon-free language is read as honesty in fintech.',
            ]),
            trustFactors: SECTION('Trust Factors', [
              'Security cues (padlocks, badges) near every money action.',
              'Transparent pricing shown before signup.',
              'Bank-level encryption mentioned in plain words.',
              'Clear, human error messages instead of codes.',
              'Regulatory signals (FDIC-style notes) near deposits.',
            ]),
            successfulPatterns: SECTION('Successful Patterns', [
              'Trusted fintech apps lead with a calm dashboard, not marketing.',
              'Onboarding asks for minimal data before showing value.',
              'Charts use one accent color on neutral surfaces.',
              'Primary CTAs are verb-first and specific ("Start a savings goal").',
              'Social proof sits beside conversion points, not hidden in footers.',
            ]),
            competitorLogos: {
              title: 'Competitor Visual Landscape',
              body: 'Leaders in family fintech favor calm blues/greens with rounded geometry.',
              brands: [
                { name: 'Monzo', colors: '#FF4F5A hot coral on white', approach: 'Friendly boldness with rounded geometry reads approachable' },
                { name: 'Revolut', colors: '#0075EB blue on black', approach: 'Tech-forward contrast signals control and precision' },
                { name: 'YNAB', colors: '#3F8F5B green on cream', approach: 'Calm savings-green evokes growth and discipline' },
                { name: 'Wise', colors: '#9FE870 lime on forest', approach: 'Fresh two-tone signals transparency and low fees' },
              ],
            },
            colorTheory: SECTION('Color Theory', [
              'Deep teal communicates stability and is underused vs fintech blue.',
              'A warm amber accent highlights actions without alarm.',
              '60-30-10 discipline: neutral surfaces, brand secondary, one accent.',
              'Keep large money numbers near-black for legibility.',
              'Avoid pure red for non-critical warnings; reserve for losses.',
            ]),
            commonMistakes: SECTION('Common Mistakes', [
              'Stocky trust badges that look fake (register domain mismatch).',
              'Dark patterns in subscription cancellation erode family trust.',
              'Overloaded dashboards raising cognitive load for busy parents.',
              'Tiny touch targets on mobile money actions.',
              'Jargon like "APY" without a plain-word tooltip.',
            ]),
          }),
          sources: JSON.stringify([
            { name: 'Baymard Institute', url: 'https://baymard.com', note: 'Checkout trust patterns' },
            { name: 'Laws of UX', url: 'https://lawsofux.com', note: 'Cognitive load guidance' },
          ]),
        },
      },
      design: {
        create: {
          // Empty object on purpose: the API re-normalizes tokens with defaults.
          tokens: '{}',
          markdown: '# DESIGN.md — Theme Demo\n\nPlaceholder spec for theme-switcher testing.',
          matchScore: 74,
          logoFeedback: JSON.stringify({
            verdict: 'The teal shield wordmark fits a family budgeting audience well.',
            issues: [],
            suggestions: [{ title: 'Show the mark on calm neutrals', detail: 'Avoid placing the logo on saturated reds.' }],
          }),
        },
      },
    },
    include: { design: true, research: true },
  });

  console.log('Seeded project:', project.id, '| status:', project.status);
  console.log('Research status:', project.research?.status, '| design?', !!project.design);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

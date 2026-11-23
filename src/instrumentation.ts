// Next.js instrumentation hook - runs once per server instance:
// dev server, standalone production server, and every Vercel
// serverless cold start.
//
// It applies the self-healing schema baseline (see
// src/lib/server/ensure-schema.ts) so a deployed build always has
// every table it queries - even when `prisma db push` was never run
// against the production database (the `public.DesignTheme does not
// exist` incident).
export async function register() {
  // Prisma only works in the Node.js runtime (skip edge middleware).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { ensureSchema } = await import('@/lib/server/ensure-schema');
    await ensureSchema();
    console.log('[instrumentation] schema baseline ensured');
  } catch (err) {
    // Never block server startup on schema sync; individual routes
    // also self-heal via withSchemaRetry when they hit a missing table.
    console.error('[instrumentation] ensureSchema failed:', err);
  }
}

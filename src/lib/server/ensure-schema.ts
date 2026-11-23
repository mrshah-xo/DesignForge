// ============================================================
// Self-healing schema baseline.
//
// DesignForge ships schema changes (new models/tables) together with
// code, but `prisma db push` is a manual step that is easy to forget
// for the production database — exactly what happened when the
// `DesignTheme` table was added: deploys started 500-ing with
// "The table `public.DesignTheme` does not exist in the current
// database" while the local SQLite file was fine.
//
// `ensureSchema()` applies an idempotent CREATE TABLE IF NOT EXISTS
// baseline for every model. It is safe to run on every server boot
// (dev server, standalone server, and each Vercel serverless cold
// start via src/instrumentation.ts): already-up-to-date databases
// skip all statements in a few milliseconds.
//
// The DDL is Postgres-flavored yet also valid on SQLite:
//   - TEXT / INTEGER exist on both
//   - TIMESTAMP(3) is native on Postgres and accepted by SQLite
//     (NUMERIC affinity — Prisma still stores DateTime as ISO text)
//   - quoted identifiers, table constraints, and
//     CREATE INDEX IF NOT EXISTS work on both engines
// ============================================================

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logoData" TEXT NOT NULL,
    "logoMime" TEXT NOT NULL DEFAULT 'image/png',
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "LogoAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "palette" TEXT NOT NULL,
    "styleTags" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "temperature" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "audienceGuess" TEXT NOT NULL,
    "trustSignals" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogoAnalysis_projectId_key" UNIQUE ("projectId")
  )`,
  `CREATE TABLE IF NOT EXISTS "AudienceProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryLabel" TEXT NOT NULL,
    "audienceDesc" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "monetization" TEXT NOT NULL,
    "trustNeed" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudienceProfile_projectId_key" UNIQUE ("projectId")
  )`,
  `CREATE TABLE IF NOT EXISTS "ResearchReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'needs_review',
    "sections" TEXT NOT NULL,
    "sources" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchReport_projectId_key" UNIQUE ("projectId")
  )`,
  `CREATE TABLE IF NOT EXISTS "DesignSpec" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "tokens" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "logoFeedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesignSpec_projectId_key" UNIQUE ("projectId")
  )`,
  `CREATE TABLE IF NOT EXISTS "DesignTheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "tokens" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "DesignTheme_projectId_idx" ON "DesignTheme"("projectId")`,
  `CREATE TABLE IF NOT EXISTS "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "progress" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "GenerationJob_projectId_kind_idx" ON "GenerationJob"("projectId", "kind")`,
];

// Column migrations — `CREATE TABLE IF NOT EXISTS` cannot add columns to
// tables that already exist, so any column added to a shipped model after
// the first deploy needs an explicit additive ALTER here. Exactly what
// happened when `LogoAnalysis.backgroundSuggestion` shipped: older DBs
// kept the old shape and every project open 500-ed with P2022 ("The
// column `LogoAnalysis.backgroundSuggestion` does not exist in the
// current database").
const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  {
    table: 'LogoAnalysis',
    column: 'backgroundSuggestion',
    // Nullable TEXT, matching `String?` in schema.prisma. Valid DDL on
    // both SQLite and Postgres.
    ddl: `ALTER TABLE "LogoAnalysis" ADD COLUMN "backgroundSuggestion" TEXT`,
  },
];

// ---------- Dialect awareness ----------
//
// The baseline ships to two engines: local/dev runs SQLite
// (DATABASE_URL=file:...) and production runs Postgres. Column
// introspection is engine-specific:
//   - SQLite exposes table info through the pragma_table_info
//     table-valued function (SQLite-only).
//   - Postgres exposes it through information_schema.columns.
// Try the SQLite probe first; when it errors (on Postgres: SQLSTATE
// 42883, "function pragma_table_info(unknown) does not exist") fall
// through to information_schema. No dialect memoization: ensureSchema
// runs once per server instance, and a transient probe failure must
// never poison a cached wrong dialect.

/**
 * True when `column` exists in `table` on the active engine.
 * Identifiers are interpolated from our own COLUMN_MIGRATIONS
 * constants (never user input), so quoting inline is safe.
 */
async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM pragma_table_info('${table}')`,
    );
    return rows.some((r) => r.name === column);
  } catch {
    // Not SQLite (or SQLite probe failed transiently) — try the
    // Postgres catalog. If this also fails the error propagates and
    // the memo reset in ensureSchema lets a later call retry.
    const rows = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = '${table}' AND column_name = '${column}'`,
    );
    return rows.length > 0;
  }
}

let schemaPromise: Promise<void> | null = null;

/**
 * Apply the baseline schema exactly once per server instance.
 * If the first attempt fails the memo is reset, so a later call retries.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const stmt of DDL) {
        await db.$executeRawUnsafe(stmt);
      }
      // Additive column migrations: skip the ones already applied.
      for (const mig of COLUMN_MIGRATIONS) {
        if (await columnExists(mig.table, mig.column)) continue;
        await db.$executeRawUnsafe(mig.ddl);
      }
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

/** Prisma error code P2021 = "table does not exist in the current database". */
export function isMissingTableError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021'
  );
}

/** Prisma error code P2022 = "column does not exist in the current database". */
export function isMissingColumnError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2022'
  );
}

/**
 * Run a Prisma query; if the database predates one of our tables or
 * columns (fresh provider DB, forgotten `db push`), apply the baseline
 * schema and replay the query once before giving up.
 */
export async function withSchemaRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isMissingTableError(err) || isMissingColumnError(err)) {
      await ensureSchema();
      return await fn();
    }
    throw err;
  }
}

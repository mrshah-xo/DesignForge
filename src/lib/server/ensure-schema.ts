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

/**
 * Run a Prisma query; if the database predates one of our tables
 * (fresh provider DB, forgotten `db push`), apply the baseline schema
 * and replay the query once before giving up.
 */
export async function withSchemaRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isMissingTableError(err)) {
      await ensureSchema();
      return await fn();
    }
    throw err;
  }
}

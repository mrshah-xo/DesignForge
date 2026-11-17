/**
 * One-off migration: local SQLite (db/custom.db) -> cloud PostgreSQL (Prisma Postgres).
 *
 * Usage: bun scripts/migrate-sqlite-to-pg.ts [--sqlite <path>]
 * Requires DATABASE_URL (Postgres) in .env or environment.
 *
 * Reads every table row from the legacy SQLite file and upserts it into the
 * cloud database preserving all ids and timestamps, so project history,
 * research reports and design specs survive the provider switch.
 */
import { Database } from 'bun:sqlite'
import { PrismaClient } from '@prisma/client'

const sqlitePath = process.argv.includes('--sqlite')
  ? process.argv[process.argv.indexOf('--sqlite') + 1]
  : 'db/custom.db'

const pg = new PrismaClient()
const sq = new Database(sqlitePath, { readonly: true })

function rows(table: string): Record<string, unknown>[] {
  return sq.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]
}

function toDate(v: unknown): Date | null {
  if (v == null) return null
  const d = new Date(v as string)
  return Number.isNaN(d.getTime()) ? null : d
}

async function main() {
  const projects = rows('Project')
  const analyses = rows('LogoAnalysis')
  const audiences = rows('AudienceProfile')
  const research = rows('ResearchReport')
  const designs = rows('DesignSpec')

  console.log(
    `SQLite source: ${projects.length} projects, ${analyses.length} analyses, ` +
      `${audiences.length} audiences, ${research.length} research reports, ${designs.length} designs`,
  )

  let count = 0
  for (const p of projects) {
    await pg.project.upsert({
      where: { id: String(p.id) },
      create: {
        id: String(p.id),
        name: String(p.name),
        description: String(p.description ?? ''),
        logoData: String(p.logoData ?? ''),
        logoMime: String(p.logoMime ?? 'image/png'),
        status: String(p.status ?? 'uploaded'),
        createdAt: toDate(p.createdAt) ?? new Date(),
        updatedAt: toDate(p.updatedAt) ?? new Date(),
      },
      update: {},
    })
    count++
  }

  for (const a of analyses) {
    const data = {
      id: String(a.id),
      projectId: String(a.projectId),
      palette: String(a.palette ?? '[]'),
      styleTags: String(a.styleTags ?? '[]'),
      mood: String(a.mood ?? ''),
      temperature: String(a.temperature ?? 'neutral'),
      industry: String(a.industry ?? ''),
      audienceGuess: String(a.audienceGuess ?? ''),
      trustSignals: String(a.trustSignals ?? '[]'),
      description: String(a.description ?? ''),
      createdAt: toDate(a.createdAt) ?? new Date(),
    }
    await pg.logoAnalysis.upsert({ where: { projectId: data.projectId }, create: data, update: data })
  }

  for (const a of audiences) {
    const data = {
      id: String(a.id),
      projectId: String(a.projectId),
      category: String(a.category ?? 'other'),
      categoryLabel: String(a.categoryLabel ?? ''),
      audienceDesc: String(a.audienceDesc ?? ''),
      platform: String(a.platform ?? 'web'),
      monetization: String(a.monetization ?? 'free'),
      trustNeed: String(a.trustNeed ?? 'medium'),
      notes: String(a.notes ?? ''),
      createdAt: toDate(a.createdAt) ?? new Date(),
    }
    await pg.audienceProfile.upsert({ where: { projectId: data.projectId }, create: data, update: data })
  }

  for (const r of research) {
    const data = {
      id: String(r.id),
      projectId: String(r.projectId),
      status: String(r.status ?? 'needs_review'),
      sections: String(r.sections ?? '{}'),
      sources: String(r.sources ?? '[]'),
      reviewedAt: toDate(r.reviewedAt),
      createdAt: toDate(r.createdAt) ?? new Date(),
      updatedAt: toDate(r.updatedAt) ?? new Date(),
    }
    await pg.researchReport.upsert({ where: { projectId: data.projectId }, create: data, update: data })
  }

  for (const d of designs) {
    const data = {
      id: String(d.id),
      projectId: String(d.projectId),
      tokens: String(d.tokens ?? '{}'),
      markdown: String(d.markdown ?? ''),
      matchScore: Number(d.matchScore ?? 0),
      logoFeedback: String(d.logoFeedback ?? '{}'),
      createdAt: toDate(d.createdAt) ?? new Date(),
      updatedAt: toDate(d.updatedAt) ?? new Date(),
    }
    await pg.designSpec.upsert({ where: { projectId: data.projectId }, create: data, update: data })
  }

  const migrated = await pg.project.count()
  console.log(`Migrated ${count} projects (+related rows). Cloud DB now has ${migrated} projects.`)
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    void pg.$disconnect()
    sq.close()
  })

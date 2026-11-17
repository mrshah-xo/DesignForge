import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

/**
 * Resolve the database URL at runtime.
 *
 * The sandbox boot script rewrites .env with a legacy SQLite URL and exports
 * it into the process environment on every container restart. An inherited
 * environment variable always wins over dotenv-style files (dotenv never
 * overrides existing variables), so when we detect that legacy `file:` URL
 * we swap in the real cloud URL from .env.local — a file the boot script
 * does not touch.
 *
 * In normal deployments (e.g. Vercel, where DATABASE_URL is set correctly and
 * no .env.local exists) the inherited environment variable is used as-is.
 */
function resolveDatabaseUrl(): string | undefined {
  const inherited = process.env.DATABASE_URL
  if (!inherited || !inherited.startsWith('file:')) return inherited
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
    const match = raw.match(/^DATABASE_URL="?([^"\r\n]+)"?\s*$/m)
    if (match && match[1].startsWith('postgres')) return match[1]
  } catch {
    // .env.local missing — fall through to the inherited URL
  }
  return inherited
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = resolveDatabaseUrl()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

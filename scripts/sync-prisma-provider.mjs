#!/usr/bin/env node
// ============================================================
// scripts/sync-prisma-provider.mjs
//
// Keeps prisma/schema.prisma's datasource provider aligned with
// the DATABASE_URL that is actually in effect, so the same repo
// runs in every environment without manual edits:
//
//   - Sandbox/preview: the boot script injects a SQLite `file:`
//     URL into .env  -> provider "sqlite" (db file under ./db).
//   - Vercel / cloud: DATABASE_URL is a Prisma Postgres URL
//     (postgres:// / postgresql://) -> provider "postgresql".
//
// Resolution order mirrors resolveDatabaseUrl() in src/lib/db.ts:
//   1. inherited process.env.DATABASE_URL (unless it is a file: URL)
//   2. DATABASE_URL from .env.local (the boot script never touches it)
//   3. DATABASE_URL from .env
//
// Modes:
//   node scripts/sync-prisma-provider.mjs          align provider (+ regenerate
//                                                  the client when it changed)
//   node scripts/sync-prisma-provider.mjs --push   align, then run
//                                                  `prisma db push --accept-data-loss`
//                                                  against the resolved URL
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const SCHEMA_PATH = path.join(ROOT, 'prisma', 'schema.prisma')
const PRISMA_CLI = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js')

function readEnvFile(name) {
  try {
    return fs.readFileSync(path.join(ROOT, name), 'utf8')
  } catch {
    return ''
  }
}

function urlFromEnvFile(text) {
  const match = text.match(/^\s*DATABASE_URL="?([^"\r\n]+)"?\s*$/m)
  return match ? match[1].trim() : ''
}

/** Same resolution order as resolveDatabaseUrl() in src/lib/db.ts. */
function resolveDatabaseUrl() {
  const inherited = process.env.DATABASE_URL || ''
  if (inherited && !inherited.startsWith('file:')) return inherited
  const localUrl = urlFromEnvFile(readEnvFile('.env.local'))
  if (localUrl.startsWith('postgres')) return localUrl
  return inherited || urlFromEnvFile(readEnvFile('.env'))
}

function providerFor(url) {
  if (/^(postgresql|postgres|prisma\+postgres):\/\//i.test(url)) return 'postgresql'
  if (url.startsWith('file:')) return 'sqlite'
  return null
}

/** Prefer the real Node binary; fall back to the current runtime (bun). */
function nodeBin() {
  const probe = spawnSync('node', ['--version'], { stdio: 'ignore' })
  return probe.error ? process.execPath : 'node'
}

function runPrisma(args, url) {
  const res = spawnSync(nodeBin(), [PRISMA_CLI, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: url ? { ...process.env, DATABASE_URL: url } : process.env,
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const url = resolveDatabaseUrl()
const provider = providerFor(url)

if (!provider) {
  console.log('[sync-prisma] No recognizable DATABASE_URL found — leaving schema provider unchanged.')
  process.exit(0)
}

const schema = fs.readFileSync(SCHEMA_PATH, 'utf8')
const current = schema.match(/provider\s*=\s*"(sqlite|postgresql)"/)?.[1] ?? null

if (current === provider) {
  console.log(`[sync-prisma] Schema provider already "${provider}" for the active DATABASE_URL — nothing to do.`)
} else {
  fs.writeFileSync(
    SCHEMA_PATH,
    schema.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${provider}"`),
  )
  console.log(
    `[sync-prisma] Schema provider switched "${current}" -> "${provider}" (DATABASE_URL protocol), regenerating client…`,
  )
  runPrisma(['generate'])
}

if (process.argv.includes('--push')) {
  runPrisma(['db', 'push', '--accept-data-loss'], url)
}

import { promises as fs } from 'fs'
import path from 'path'

/**
 * Local secret store — the in-app way to paste API keys without ever
 * committing them.
 *
 * Values live in `.env.local` at the project root:
 *  - it is git-ignored (`.env*` rule) so it can never be pushed to GitHub
 *  - Next.js loads it into `process.env` automatically and hot-reloads it in dev
 *  - the raw values are never returned by any API — only a masked last-4
 *
 * Writes are disabled in production builds (Vercel filesystems are
 * read-only anyway) — there, keys belong in the Vercel dashboard.
 */

export const SECRETS_FILE = '.env.local'

export interface SecretMeta {
  name: string
  label: string
  description: string
  /** Hide the masked preview entirely for the most sensitive keys */
  sensitive: boolean
}

/** Keys DesignForge actually reads (see src/lib/server/ai.ts). */
export const MANAGED_SECRETS: SecretMeta[] = [
  {
    name: 'ZAI_API_KEY',
    label: 'Z.AI API key',
    description: 'Powers logo analysis, audience research and design generation.',
    sensitive: true,
  },
  {
    name: 'ZAI_BASE_URL',
    label: 'Z.AI base URL',
    description: 'API endpoint, e.g. https://api.z.ai/api/paas/v4',
    sensitive: false,
  },
  {
    name: 'ZAI_TEXT_MODEL',
    label: 'Text model',
    description: 'Override the text model — glm-4.5-flash is free on the Z.AI Open Platform.',
    sensitive: false,
  },
  {
    name: 'ZAI_VISION_MODEL',
    label: 'Vision model',
    description: 'Override the vision model used for logo image analysis (default glm-4.6v).',
    sensitive: false,
  },
  {
    name: 'ZAI_TOKEN',
    label: 'Z.AI gateway token',
    description: 'Optional gateway auth token, only if your deployment uses one.',
    sensitive: true,
  },
]

const KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
const MAX_VALUE_LENGTH = 2000

/** Writes only work in dev; production deployments are public + read-only. */
export function secretsWritable(): boolean {
  return process.env.NODE_ENV !== 'production'
}

function secretsFilePath(): string {
  return path.join(process.cwd(), SECRETS_FILE)
}

/** KEY=value lines currently defined in .env.local (no values leaves the server). */
function parseEnvFile(content: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const name = line.slice(0, eq).trim().replace(/^export\s+/, '')
    if (!KEY_PATTERN.test(name)) continue
    let value = line.slice(eq + 1).trim()
    // Strip surrounding quotes so masking matches the loaded value.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    map.set(name, value)
  }
  return map
}

/** Vercel-style mask: show only the last 4 characters. */
function mask(value: string | undefined, sensitive: boolean): string | undefined {
  if (!value || sensitive || value.length < 8) return undefined
  return `••••${value.slice(-4)}`
}

export interface SecretStatus {
  name: string
  label: string
  description: string
  sensitive: boolean
  /** Resolved value is present and non-empty */
  set: boolean
  /** Where the winning value comes from */
  source: 'local-file' | 'environment' | 'not-set'
  masked?: string
  /** True when the shell environment shadows a value saved in .env.local */
  shadowed: boolean
}

export async function readSecretStatuses(): Promise<SecretStatus[]> {
  let fileMap = new Map<string, string>()
  try {
    fileMap = parseEnvFile(await fs.readFile(secretsFilePath(), 'utf8'))
  } catch {
    // No .env.local yet — everything is simply "not set" locally.
  }

  const managedNames = new Set(MANAGED_SECRETS.map((s) => s.name))
  const statuses: SecretStatus[] = MANAGED_SECRETS.map((meta) => {
    const inFile = fileMap.get(meta.name)
    const inFileSet = typeof inFile === 'string' && inFile.length > 0
    const inEnv = process.env[meta.name]
    const inEnvSet = typeof inEnv === 'string' && inEnv.length > 0
    // Next.js gives precedence to real (shell-exported) environment variables
    // over .env files — but it also merges .env.local into process.env after a
    // hot reload, so an env value identical to the file value still counts as
    // file-origin. Only a *differing* env value truly shadows the file.
    const winningValue = inEnvSet ? inEnv : inFileSet ? inFile : undefined
    const shadowed = inFileSet && inEnvSet && inEnv !== inFile
    const source: SecretStatus['source'] = !inEnvSet && !inFileSet
      ? 'not-set'
      : inFileSet && (!inEnvSet || inEnv === inFile)
        ? 'local-file'
        : 'environment'
    return {
      name: meta.name,
      label: meta.label,
      description: meta.description,
      sensitive: meta.sensitive,
      set: Boolean(winningValue),
      source,
      masked: mask(winningValue, meta.sensitive),
      shadowed,
    }
  })

  // Custom keys the user added beyond the managed list.
  for (const [name, value] of fileMap) {
    if (managedNames.has(name)) continue
    const inEnv = process.env[name]
    const inEnvSet = typeof inEnv === 'string' && inEnv.length > 0
    const shadowed = inEnvSet && inEnv !== value
    statuses.push({
      name,
      label: name,
      description: 'Custom key',
      sensitive: true,
      set: inEnvSet || value.length > 0,
      // The loop iterates file entries, so file-origin is the default;
      // only a differing shell-exported value makes it 'environment'.
      source: shadowed ? 'environment' : 'local-file',
      masked: undefined, // custom keys are treated as sensitive — no preview
      shadowed,
    })
  }

  return statuses
}

/**
 * Upsert / remove keys in .env.local, preserving every unrelated line.
 * Passing `null` as a value removes the key from the file.
 */
export async function upsertSecrets(
  values: Record<string, string | null>,
): Promise<void> {
  for (const [name, value] of Object.entries(values)) {
    if (!KEY_PATTERN.test(name)) {
      throw new Error(`Invalid key name "${name}" — use UPPER_SNAKE_CASE.`)
    }
    if (value !== null && value.includes('\n')) {
      throw new Error(`Value for ${name} must be a single line.`)
    }
    if (value !== null && value.length > MAX_VALUE_LENGTH) {
      throw new Error(`Value for ${name} is too long (max ${MAX_VALUE_LENGTH} chars).`)
    }
  }

  let content = ''
  try {
    content = await fs.readFile(secretsFilePath(), 'utf8')
  } catch {
    content = '# Added by DesignForge — local secrets, git-ignored, never commit.\n'
  }

  const lines = content.split('\n')
  const names = new Set(Object.keys(values))

  // Drop existing definitions of the managed keys (keep comments/blanks).
  const kept = lines.filter((rawLine) => {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) return true
    const eq = line.indexOf('=')
    if (eq <= 0) return true
    const name = line.slice(0, eq).trim().replace(/^export\s+/, '')
    return !names.has(name)
  })

  const additions = Object.entries(values)
    .filter(([, value]) => value !== null && value !== '')
    .map(([name, value]) => `${name}=${value}`)
  if (additions.length > 0) {
    // Ensure a blank line separates the appended block for readability.
    while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop()
    kept.push('')
    kept.push(...additions)
  }

  let next = kept.join('\n')
  if (!next.endsWith('\n')) next += '\n'

  // Atomic write: temp file + rename, then tighten permissions.
  const tmpPath = `${secretsFilePath()}.tmp`
  await fs.writeFile(tmpPath, next, { mode: 0o600 })
  await fs.rename(tmpPath, secretsFilePath())
  await fs.chmod(secretsFilePath(), 0o600).catch(() => {})
}

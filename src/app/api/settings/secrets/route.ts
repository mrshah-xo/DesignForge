import { NextRequest, NextResponse } from 'next/server'
import type { ApiEnvelope } from '@/lib/types'
import {
  readSecretStatuses,
  secretsWritable,
  upsertSecrets,
} from '@/lib/server/secrets'

interface SecretsGetPayload {
  writable: boolean
  secrets: Awaited<ReturnType<typeof readSecretStatuses>>
  note: string | null
}

interface SecretsPostPayload {
  secrets: Awaited<ReturnType<typeof readSecretStatuses>>
}

/**
 * Secrets manager API.
 *
 * GET  -> statuses only: which keys are set, where they come from, and a
 *         masked last-4 preview. Raw values never leave the server.
 * POST -> { values: { KEY: "value" | null } } writes to the git-ignored
 *         .env.local file. Disabled on production deployments (read-only,
 *         publicly reachable) - keys belong in the Vercel dashboard there.
 */

export async function GET() {
  const writable = secretsWritable()
  // Production deployments are public: do not leak even masked hints.
  const secrets = writable ? await readSecretStatuses() : []
  return NextResponse.json({
    ok: true,
    data: {
      writable,
      secrets,
      note: writable
        ? null
        : 'This deployment is read-only. Set environment variables in your Vercel dashboard (Settings > Environment Variables) and redeploy.',
    },
  } satisfies ApiEnvelope<SecretsGetPayload>)
}

interface SecretsPostBody {
  values?: Record<string, string | null>
}

export async function POST(request: NextRequest) {
  if (!secretsWritable()) {
    return NextResponse.json(
      { ok: false, error: 'Secrets can only be edited on a local dev server. On Vercel, add them as dashboard environment variables.' },
      { status: 403 },
    )
  }

  let body: SecretsPostBody
  try {
    body = (await request.json()) as SecretsPostBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const values = body.values
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return NextResponse.json(
      { ok: false, error: 'Body must be { values: { KEY: string | null } }.' },
      { status: 400 },
    )
  }
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ ok: false, error: 'No keys provided.' }, { status: 400 })
  }

  try {
    await upsertSecrets(values)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not write .env.local.'
    const ro =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'EROFS'
    return NextResponse.json(
      { ok: false, error: ro ? 'Filesystem is read-only - set keys in your Vercel dashboard.' : message },
      { status: 400 },
    )
  }

  // Deliberately do not echo the submitted values back.
  return NextResponse.json({
    ok: true,
    data: { secrets: await readSecretStatuses() },
  } satisfies ApiEnvelope<SecretsPostPayload>)
}

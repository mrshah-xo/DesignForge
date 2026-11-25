// ============================================================
// Typed API client for MrDesign.md frontend.
// Every endpoint answers the standard envelope:
//   { ok: true, data } | { ok: false, error }
// All requests use relative paths only, so the app works behind any
// reverse proxy without configuration.
// ============================================================
import type {
  AnalysisData,
  AudienceData,
  DesignData,
  DesignTokens,
  JobInfo,
  ProjectDetail,
  ProjectSummary,
  ResearchData,
  ResearchSections,
  ResearchSource,
  ThemeVariant,
  ApiEnvelope,
} from '@/lib/types'
import type { ParsedBrief } from '@/lib/brief'

// ---------- Export JSON payload ----------
export interface ExportJson {
  design_md: string
  tokens: DesignTokens
  metadata: Record<string, unknown>
  logo_base64: string
  logo_mime: string
  brand_sheet_svg: string
}

// ---------- Bring-your-own-key (browser side) ----------

const USER_KEY_STORAGE = 'df_user_api_key'
/** Emitted when the server reports a request needs the visitor's API key. */
export const MISSING_KEY_EVENT = 'df:missing-key'

/** The visitor's own Z.AI key - lives ONLY in this browser's localStorage. */
export function getUserApiKey(): string {
  try {
    return (localStorage.getItem(USER_KEY_STORAGE) ?? '').trim()
  } catch {
    return ''
  }
}

export function setUserApiKey(key: string): void {
  try {
    localStorage.setItem(USER_KEY_STORAGE, key.trim())
  } catch {
    /* storage unavailable (private mode) - key simply won't persist */
  }
}

export function clearUserApiKey(): void {
  try {
    localStorage.removeItem(USER_KEY_STORAGE)
  } catch {
    /* ignore */
  }
}

/** Masked preview for the panel (last 4 characters). */
export function maskedUserApiKey(): string | undefined {
  const key = getUserApiKey()
  return key.length >= 8 ? `••••${key.slice(-4)}` : undefined
}

// ---------- Envelope-aware request wrapper ----------
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    // Attach the visitor's own key to every request when present. The key is
    // used for this request's AI calls only - never persisted server-side.
    const userKey = getUserApiKey()
    const headers = new Headers(init?.headers)
    if (userKey) headers.set('x-user-key', userKey)
    res = await fetch(url, { ...init, headers })
  } catch {
    throw new Error('Network error - could not reach the server.')
  }

  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // Non-JSON body (should not happen for envelope endpoints)
  }

  const envelope = (json ?? null) as ApiEnvelope<T> | null
  if (!envelope || typeof envelope.ok !== 'boolean' || envelope.ok !== true || envelope.data === undefined) {
    // BYOK gate: surface the panel so the visitor can paste a key.
    if (envelope?.requiresUserKey === true && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MISSING_KEY_EVENT))
    }
    throw new Error(envelope?.error ?? `Request failed (${res.status})`)
  }
  return envelope.data
}

// ---------- Download / clipboard helpers ----------
function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'mrdesign'
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  triggerDownload(URL.createObjectURL(blob), filename)
}

export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Fallback for non-secure contexts
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
}

// ---------- Async job helper ----------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const JOB_TIMEOUT_MS = 6 * 60 * 1000 // generous ceiling; pipelines take 20-90s
const POLL_INTERVAL_MS = 1500

/**
 * Run a long AI pipeline as an async job: POST starts it and returns a job
 * id immediately (no request stays open long enough for the preview gateway
 * to cut it), then a short GET is polled until done/error. Each poll that
 * carries a `job.progress` step fires `onProgress` so the UI can show what
 * the AI is actually doing.
 */
async function runJob<T>(
  startUrl: string,
  pollUrl: (jobId: string) => string,
  extract: (data: { job: JobInfo } & Record<string, unknown>) => T,
  startedLabel: string,
  onProgress?: (step: string) => void,
): Promise<T> {
  const start = await request<{ job: JobInfo }>(startUrl, { method: 'POST' })
  const jobId = start.job?.id
  if (!jobId) throw new Error(`${startedLabel}: no job id returned`)

  const emit = (step: string | null | undefined) => {
    if (step && onProgress) onProgress(step)
  }
  emit(start.job?.progress)

  const deadline = Date.now() + JOB_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    const data = await request<{ job: JobInfo } & Record<string, unknown>>(pollUrl(jobId))
    const status = data.job?.status
    emit(data.job?.progress)
    if (status === 'done') return extract(data)
    if (status === 'error') throw new Error(data.job?.error || 'Generation failed')
    // still running - keep polling
  }
  throw new Error(`${startedLabel} timed out - please try again.`)
}

// ---------- API functions ----------
export const api = {
  createProject(form: FormData): Promise<ProjectSummary> {
    return request<ProjectSummary>('/api/projects', { method: 'POST', body: form })
  },

  /** LLM extraction fallback for the "Want a prompt?" brief flow. */
  async parseBrief(text: string): Promise<{ brief: ParsedBrief }> {
    const data = await request<{ brief: ParsedBrief }>('/api/parse-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    return data
  },

  async listProjects(): Promise<ProjectSummary[]> {
    const data = await request<{ projects: ProjectSummary[] }>('/api/projects')
    return data.projects ?? []
  },

  getProject(id: string): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}`)
  },

  analyzeProject(id: string): Promise<AnalysisData> {
    const base = `/api/projects/${encodeURIComponent(id)}/analyze`
    return runJob<AnalysisData>(
      base,
      (jobId) => `${base}?jobId=${encodeURIComponent(jobId)}`,
      (data) => data.analysis as AnalysisData,
      'Logo analysis',
    )
  },

  async saveAudience(id: string, audience: AudienceData): Promise<AudienceData> {
    const data = await request<{ audience: AudienceData }>(
      `/api/projects/${encodeURIComponent(id)}/audience`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audience),
      }
    )
    return data.audience
  },

  runResearch(id: string, onProgress?: (step: string) => void): Promise<ResearchData> {
    const base = `/api/projects/${encodeURIComponent(id)}/research`
    return runJob<ResearchData>(
      base,
      (jobId) => `${base}?jobId=${encodeURIComponent(jobId)}`,
      (data) => data.research as ResearchData,
      'Research',
      onProgress,
    )
  },

  async saveResearch(
    id: string,
    payload: { sections: ResearchSections; sources: ResearchSource[]; approve?: boolean }
  ): Promise<ResearchData> {
    const data = await request<{ research: ResearchData }>(
      `/api/projects/${encodeURIComponent(id)}/research`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    return data.research
  },

  generateDesign(id: string, onProgress?: (step: string) => void): Promise<DesignData> {
    const base = `/api/projects/${encodeURIComponent(id)}/design`
    return runJob<DesignData>(
      base,
      (jobId) => `${base}?jobId=${encodeURIComponent(jobId)}`,
      (data) => data.design as DesignData,
      'Design generation',
      onProgress,
    )
  },

  async saveDesign(
    id: string,
    payload: { tokens?: DesignTokens; markdown?: string }
  ): Promise<DesignData> {
    const data = await request<{ design: DesignData }>(
      `/api/projects/${encodeURIComponent(id)}/design`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    return data.design
  },

  /** AI-suggested research-grounded theme variants (starts job + polls). */
  generateThemes(id: string, onProgress?: (step: string) => void): Promise<ThemeVariant[]> {
    const base = `/api/projects/${encodeURIComponent(id)}/design/themes`
    return runJob<ThemeVariant[]>(
      base,
      (jobId) => `${base}?jobId=${encodeURIComponent(jobId)}`,
      (data) => data.themes as ThemeVariant[],
      'Theme suggestions',
      onProgress,
    )
  },

  async fetchThemes(id: string): Promise<ThemeVariant[]> {
    const data = await request<{ themes: ThemeVariant[] }>(
      `/api/projects/${encodeURIComponent(id)}/design/themes`,
    )
    return data.themes ?? []
  },

  async fetchExportJson(id: string): Promise<ExportJson> {
    return request<ExportJson>(`/api/projects/${encodeURIComponent(id)}/export?format=json`)
  },

  async downloadZip(id: string, fallbackName?: string): Promise<void> {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}/export`)
    if (!res.ok) throw new Error(`Export failed (${res.status})`)

    // Defensive: the zip endpoint may answer with a JSON envelope on failure.
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const json = (await res.json()) as ApiEnvelope<unknown>
      throw new Error(json?.error ?? 'Export failed')
    }

    const blob = await res.blob()
    const disposition = res.headers.get('content-disposition') ?? ''
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
    const filename = match
      ? decodeURIComponent(match[1].trim())
      : `${slugify(fallbackName ?? 'mrdesign')}-design-package.zip`
    triggerDownload(URL.createObjectURL(blob), filename)
  },
}

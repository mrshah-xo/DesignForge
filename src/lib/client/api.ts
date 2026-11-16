// ============================================================
// Typed API client for DesignForge frontend.
// Every endpoint answers the standard envelope:
//   { ok: true, data } | { ok: false, error }
// All requests use relative paths only (Caddy gateway friendly).
// ============================================================

import type {
  AnalysisData,
  AudienceData,
  DesignData,
  DesignTokens,
  ProjectDetail,
  ProjectSummary,
  ResearchData,
  ResearchSections,
  ResearchSource,
  ApiEnvelope,
} from '@/lib/types'

// ---------- Export JSON payload ----------
export interface ExportJson {
  design_md: string
  tokens: DesignTokens
  metadata: Record<string, unknown>
  logo_base64: string
  logo_mime: string
  brand_sheet_svg: string
}

// ---------- Envelope-aware request wrapper ----------
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error('Network error — could not reach the server.')
  }

  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // Non-JSON body (should not happen for envelope endpoints)
  }

  const envelope = (json ?? null) as ApiEnvelope<T> | null
  if (!envelope || typeof envelope.ok !== 'boolean' || envelope.ok !== true || envelope.data === undefined) {
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
  return slug || 'designforge'
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

// ---------- API functions ----------
export const api = {
  createProject(form: FormData): Promise<ProjectSummary> {
    return request<ProjectSummary>('/api/projects', { method: 'POST', body: form })
  },

  async listProjects(): Promise<ProjectSummary[]> {
    const data = await request<{ projects: ProjectSummary[] }>('/api/projects')
    return data.projects ?? []
  },

  getProject(id: string): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}`)
  },

  async analyzeProject(id: string): Promise<AnalysisData> {
    const data = await request<{ analysis: AnalysisData }>(
      `/api/projects/${encodeURIComponent(id)}/analyze`,
      { method: 'POST' }
    )
    return data.analysis
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

  async runResearch(id: string): Promise<ResearchData> {
    const data = await request<{ research: ResearchData }>(
      `/api/projects/${encodeURIComponent(id)}/research`,
      { method: 'POST' }
    )
    return data.research
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

  async generateDesign(id: string): Promise<DesignData> {
    const data = await request<{ design: DesignData }>(
      `/api/projects/${encodeURIComponent(id)}/design`,
      { method: 'POST' }
    )
    return data.design
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
      : `${slugify(fallbackName ?? 'designforge')}-design-package.zip`
    triggerDownload(URL.createObjectURL(blob), filename)
  },
}

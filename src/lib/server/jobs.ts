// ============================================================
// In-memory async job registry for long-running AI pipelines
// (analyze / research / design). Generation endpoints return a
// job id immediately so no HTTP request stays open long enough
// to be cut by the preview gateway (~60s limit) — the frontend
// polls a short GET until the job reaches done/error.
//
// Serverless note (Vercel): lambdas are multi-instance, so an
// in-memory Map alone cannot carry job state across polls. Job
// ids therefore embed the start timestamp (job_<ms>_<rand>) and
// each route falls back to DB markers (row updatedAt/status)
// when a poll lands on an instance that never saw the job.
// ============================================================

export type JobKind = 'analyze' | 'research' | 'design' | 'themes';
export type JobStatus = 'running' | 'done' | 'error';

export interface JobRecord {
  id: string;
  kind: JobKind;
  projectId: string;
  status: JobStatus;
  error: string | null;
  /** Latest human-readable pipeline step (what the AI is doing right now). */
  progress: string | null;
  createdAt: number;
  updatedAt: number;
}

const JOB_TTL_MS = 30 * 60 * 1000; // keep finished jobs around for 30 min
const MAX_TRACKED = 200;

/**
 * How long a poll may keep trusting "still running" on an instance that
 * never saw the in-memory job. After this window, DB-marker fallbacks
 * report an interruption instead of polling forever.
 */
export const STALE_JOB_MS = 5 * 60 * 1000;

/** Grace window subtracted when comparing DB row timestamps to job start. */
export const JOB_TS_SKEW_MS = 2000;

const JOB_ID_RE = /^job_(\d{10,})_[a-z0-9]+$/i;

/** Extract the start timestamp (epoch ms) embedded in a job id, if any. */
export function jobStartTs(jobId: string): number | null {
  const m = JOB_ID_RE.exec(jobId);
  if (!m) return null;
  const ts = Number(m[1]);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

function newJobId(): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `job_${Date.now()}_${rand}`;
}

const jobs = new Map<string, JobRecord>();

function prune(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
  // Hard cap (oldest first) as a second line of defense.
  while (jobs.size > MAX_TRACKED) {
    const oldest = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) break;
    jobs.delete(oldest.id);
  }
}

/** Register a new running job for a project pipeline. */
export function createJob(kind: JobKind, projectId: string): JobRecord {
  prune();
  const now = Date.now();
  const job: JobRecord = {
    id: newJobId(),
    kind,
    projectId,
    status: 'running',
    error: null,
    progress: null,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): JobRecord | null {
  return jobs.get(id) ?? null;
}

/** Is a job of this kind already running for this project? */
export function findRunningJob(projectId: string, kind: JobKind): JobRecord | null {
  for (const job of jobs.values()) {
    if (job.projectId === projectId && job.kind === kind && job.status === 'running') {
      return job;
    }
  }
  return null;
}

/** Record the current pipeline step so polls surface real progress. */
export function setJobProgress(id: string, message: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.progress = message;
  job.updatedAt = Date.now();
}

/** Transition a job to a terminal state (done / error). */
export function finishJob(id: string, status: 'done' | 'error', error?: string): JobRecord | null {
  const job = jobs.get(id);
  if (!job) return null;
  job.status = status;
  job.error = error ?? null;
  job.updatedAt = Date.now();
  return job;
}

/** Standard shape returned by start/poll endpoints. */
export function publicJob(job: JobRecord): {
  id: string;
  kind: JobKind;
  projectId: string;
  status: JobStatus;
  error: string | null;
  progress: string | null;
} {
  return {
    id: job.id,
    kind: job.kind,
    projectId: job.projectId,
    status: job.status,
    error: job.error,
    progress: job.progress,
  };
}

/**
 * A job view reconstructed on an instance that never held the in-memory
 * record (serverless multi-instance polling). Same wire shape as publicJob.
 */
export function syntheticJob(
  id: string,
  kind: JobKind,
  projectId: string,
  status: JobStatus,
  error: string | null = null,
  progress: string | null = null,
): {
  id: string;
  kind: JobKind;
  projectId: string;
  status: JobStatus;
  error: string | null;
  progress: string | null;
} {
  return { id, kind, projectId, status, error, progress };
}

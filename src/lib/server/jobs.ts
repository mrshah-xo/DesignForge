// ============================================================
// In-memory async job registry for long-running AI pipelines
// (analyze / research / design). Generation endpoints return a
// job id immediately so no HTTP request stays open long enough
// to be cut by the preview gateway (~60s limit) — the frontend
// polls a short GET until the job reaches done/error.
// ============================================================

export type JobKind = 'analyze' | 'research' | 'design';
export type JobStatus = 'running' | 'done' | 'error';

export interface JobRecord {
  id: string;
  kind: JobKind;
  projectId: string;
  status: JobStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const JOB_TTL_MS = 30 * 60 * 1000; // keep finished jobs around for 30 min
const MAX_TRACKED = 200;

const jobs = new Map<string, JobRecord>();

function newJobId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

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
} {
  return {
    id: job.id,
    kind: job.kind,
    projectId: job.projectId,
    status: job.status,
    error: job.error,
  };
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RenderJobRecord, RenderOptions } from './types.js';
import { ProjectPaths } from './paths.js';
import { renderProjectVideo } from './render.js';

const MAX_JOBS_RETAINED = 40;
const MAX_LOGS_PER_JOB = 60;

export type RenderJobProgressHook = (
  job: RenderJobRecord,
  stage: string,
  progress: number,
  message: string,
) => void;

export class RenderJobManager {
  private jobs = new Map<string, RenderJobRecord>();

  private persistProjectJobs(paths: ProjectPaths): void {
    try {
      fs.mkdirSync(paths.buildDir, { recursive: true });
      const filePath = path.join(paths.buildDir, 'render_jobs.json');
      const projectJobs = Array.from(this.jobs.values())
        .filter((j) => j.projectSlug === paths.slug)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20);
      fs.writeFileSync(filePath, JSON.stringify(projectJobs, null, 2), 'utf8');
    } catch {
      // non-fatal persistence failure
    }
  }

  private pruneOldJobs(): void {
    if (this.jobs.size <= MAX_JOBS_RETAINED) return;
    const sorted = Array.from(this.jobs.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    for (const stale of sorted.slice(MAX_JOBS_RETAINED)) {
      if (stale.status === 'succeeded' || stale.status === 'failed') {
        this.jobs.delete(stale.jobId);
      }
    }
  }

  startRenderJob(
    paths: ProjectPaths,
    options: RenderOptions = {},
    onProgress?: RenderJobProgressHook,
  ): RenderJobRecord {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const preset = options.preset || 'production';

    const job: RenderJobRecord = {
      jobId,
      projectSlug: paths.slug,
      preset,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      message: `Queued ${preset} render for ${paths.slug}`,
      createdAt: now,
      updatedAt: now,
      logs: [{ timestamp: now, stage: 'queued', progress: 0, message: `Queued ${preset} render` }],
    };

    this.jobs.set(jobId, job);
    this.pruneOldJobs();
    this.persistProjectJobs(paths);

    // Execute render asynchronously so callers (especially MCP tools) never time out
    void (async () => {
      job.status = 'running';
      job.stage = 'starting';
      job.updatedAt = new Date().toISOString();
      this.persistProjectJobs(paths);

      try {
        const result = await renderProjectVideo(
          paths,
          {
            ...options,
            autoSnapshot: options.autoSnapshot !== false,
          },
          (stage, progress, message) => {
            const ts = new Date().toISOString();
            job.stage = stage;
            job.progress = Math.max(0, Math.min(1, progress));
            job.message = message;
            job.updatedAt = ts;
            job.logs.push({ timestamp: ts, stage, progress: job.progress, message });
            if (job.logs.length > MAX_LOGS_PER_JOB) {
              job.logs = job.logs.slice(-MAX_LOGS_PER_JOB);
            }
            this.persistProjectJobs(paths);
            onProgress?.(job, stage, job.progress, message);
          },
        );

        const doneTs = new Date().toISOString();
        job.status = 'succeeded';
        job.stage = 'done';
        job.progress = 1;
        job.result = result;
        job.message = `Render complete: ${result.relativePath} (${(result.sizeBytes / (1024 * 1024)).toFixed(2)} MB)`;
        job.updatedAt = doneTs;
        job.completedAt = doneTs;
        this.persistProjectJobs(paths);
        onProgress?.(job, 'done', 1, job.message);
      } catch (err) {
        const failTs = new Date().toISOString();
        const msg = err instanceof Error ? err.message : String(err);
        job.status = 'failed';
        job.stage = 'error';
        job.progress = 1;
        job.error = msg;
        job.message = `Render failed: ${msg}`;
        job.updatedAt = failTs;
        job.completedAt = failTs;
        job.logs.push({ timestamp: failTs, stage: 'error', progress: 1, message: msg });
        this.persistProjectJobs(paths);
        onProgress?.(job, 'error', 1, msg);
      }
    })();

    return job;
  }

  getJob(jobId: string, projectPaths?: ProjectPaths): RenderJobRecord | null {
    const live = this.jobs.get(jobId);
    if (live) return live;
    if (projectPaths) {
      const persisted = this.readPersistedJobs(projectPaths);
      return persisted.find((j) => j.jobId === jobId) || null;
    }
    return null;
  }

  listJobs(projectSlug?: string, projectPaths?: ProjectPaths): RenderJobRecord[] {
    const map = new Map<string, RenderJobRecord>();
    if (projectPaths) {
      for (const j of this.readPersistedJobs(projectPaths)) {
        map.set(j.jobId, j);
      }
    }
    for (const j of this.jobs.values()) {
      if (!projectSlug || j.projectSlug === projectSlug) {
        map.set(j.jobId, j);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private readPersistedJobs(paths: ProjectPaths): RenderJobRecord[] {
    const filePath = path.join(paths.buildDir, 'render_jobs.json');
    if (!fs.existsSync(filePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return Array.isArray(parsed) ? (parsed as RenderJobRecord[]) : [];
    } catch {
      return [];
    }
  }
}

export const defaultRenderJobManager = new RenderJobManager();

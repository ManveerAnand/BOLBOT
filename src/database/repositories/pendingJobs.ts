import type { AppDatabase } from "../db.js";
import { nowIso } from "../time.js";
import type { PendingJobStatus, PendingTranslationJob } from "../types.js";

interface PendingJobRow {
  id: string;
  logical_message_id: string;
  target_view_id: string;
  revision: number;
  attempts: number;
  next_attempt_at: string;
  status: PendingJobStatus;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export class PendingJobRepository {
  constructor(private readonly db: AppDatabase) {}

  enqueue(input: {
    id: string;
    logicalMessageId: string;
    targetViewId: string;
    revision: number;
    nextAttemptAt?: string;
  }): PendingTranslationJob {
    const timestamp = nowIso();
    this.db.sqlite
      .prepare(
        `INSERT INTO pending_translation_jobs (
          id, logical_message_id, target_view_id, revision, attempts,
          next_attempt_at, status, last_error_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, ?, 'queued', NULL, ?, ?)
        ON CONFLICT(logical_message_id, target_view_id, revision) DO NOTHING`,
      )
      .run(
        input.id,
        input.logicalMessageId,
        input.targetViewId,
        input.revision,
        input.nextAttemptAt ?? timestamp,
        timestamp,
        timestamp,
      );
    return this.getByTriple(
      input.logicalMessageId,
      input.targetViewId,
      input.revision,
    )!;
  }

  getByTriple(
    logicalMessageId: string,
    targetViewId: string,
    revision: number,
  ): PendingTranslationJob | undefined {
    const row = this.db.sqlite
      .prepare(
        `SELECT * FROM pending_translation_jobs
         WHERE logical_message_id = ? AND target_view_id = ? AND revision = ?`,
      )
      .get(logicalMessageId, targetViewId, revision) as
      | PendingJobRow
      | undefined;
    return row ? mapPendingJob(row) : undefined;
  }

  get(id: string): PendingTranslationJob | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM pending_translation_jobs WHERE id = ?")
      .get(id) as PendingJobRow | undefined;
    return row ? mapPendingJob(row) : undefined;
  }

  listDue(now: string): PendingTranslationJob[] {
    const rows = this.db.sqlite
      .prepare(
        `SELECT * FROM pending_translation_jobs
         WHERE status IN ('queued', 'failed') AND next_attempt_at <= ?
         ORDER BY next_attempt_at`,
      )
      .all(now) as PendingJobRow[];
    return rows.map(mapPendingJob);
  }

  markStatus(
    id: string,
    status: PendingJobStatus,
    lastErrorCode?: string | null,
  ): void {
    this.db.sqlite
      .prepare(
        `UPDATE pending_translation_jobs
         SET status = ?, last_error_code = ?, updated_at = ?,
             attempts = CASE WHEN ? IN ('failed', 'running') THEN attempts + 1 ELSE attempts END
         WHERE id = ?`,
      )
      .run(status, lastErrorCode ?? null, nowIso(), status, id);
  }

  claim(id: string): boolean {
    const result = this.db.sqlite
      .prepare(
        `UPDATE pending_translation_jobs
         SET status = 'running', updated_at = ?
         WHERE id = ? AND status IN ('queued', 'failed')`,
      )
      .run(nowIso(), id);
    return result.changes === 1;
  }

  complete(id: string): void {
    this.db.sqlite
      .prepare(
        `UPDATE pending_translation_jobs
         SET status = 'done', last_error_code = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(nowIso(), id);
  }

  fail(id: string, errorCode: string, nextAttemptAt: string): void {
    this.db.sqlite
      .prepare(
        `UPDATE pending_translation_jobs
         SET status = 'failed', last_error_code = ?, next_attempt_at = ?,
             attempts = attempts + 1, updated_at = ?
         WHERE id = ?`,
      )
      .run(errorCode, nextAttemptAt, nowIso(), id);
  }

  cancel(id: string, errorCode: string): void {
    this.db.sqlite
      .prepare(
        `UPDATE pending_translation_jobs
         SET status = 'cancelled', last_error_code = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(errorCode, nowIso(), id);
  }

  cancelStale(logicalMessageId: string, currentRevision: number): number {
    return this.db.sqlite
      .prepare(
        `UPDATE pending_translation_jobs
         SET status = 'cancelled', last_error_code = 'stale_revision', updated_at = ?
         WHERE logical_message_id = ?
           AND revision < ?
           AND status IN ('queued', 'failed', 'running')`,
      )
      .run(nowIso(), logicalMessageId, currentRevision).changes;
  }

  cancelOpen(logicalMessageId: string, errorCode: string): number {
    return this.db.sqlite
      .prepare(
        `UPDATE pending_translation_jobs
         SET status = 'cancelled', last_error_code = ?, updated_at = ?
         WHERE logical_message_id = ?
           AND status IN ('queued', 'failed', 'running')`,
      )
      .run(errorCode, nowIso(), logicalMessageId).changes;
  }

  requeueRunning(): number {
    return this.db.sqlite
      .prepare(
        `UPDATE pending_translation_jobs
         SET status = 'queued', updated_at = ?
         WHERE status = 'running'`,
      )
      .run(nowIso()).changes;
  }
}

function mapPendingJob(row: PendingJobRow): PendingTranslationJob {
  return {
    id: row.id,
    logicalMessageId: row.logical_message_id,
    targetViewId: row.target_view_id,
    revision: row.revision,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    status: row.status,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

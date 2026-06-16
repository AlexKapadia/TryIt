/**
 * @tryit/contracts/jobs — the asynchronous try-on job contract.
 *
 * A try-on request becomes a tracked job that moves through a status lifecycle
 * (queued -> processing -> succeeded|failed). The job carries the originating request, the
 * result on success, an error message on failure, and ISO-8601 timestamps. `idempotencyKey`
 * is optional and lets a caller safely retry without creating duplicate jobs. The schema is
 * the persisted/wire shape, parsed at the boundary so a corrupted record fails closed.
 */

import { z } from 'zod';
import { TryOnRequestSchema, TryOnResultSchema } from './tryon.js';

/**
 * The lifecycle states of a try-on job. A job is created `queued`, moves to `processing`
 * while a provider runs, and ends terminally as `succeeded` or `failed`.
 */
export const TryOnJobStatusSchema = z.enum(['queued', 'processing', 'succeeded', 'failed']);

/** A try-on job lifecycle status. */
export type TryOnJobStatus = z.infer<typeof TryOnJobStatusSchema>;

/**
 * A tracked try-on job.
 *
 * `result` is present on success and `error` on failure; both are optional because they are
 * absent in the pending states. `createdAt`/`updatedAt` are ISO-8601 datetimes. The optional
 * `idempotencyKey` deduplicates retries of the same logical request.
 */
export const TryOnJobSchema = z.object({
  jobId: z.string().min(1),
  status: TryOnJobStatusSchema,
  request: TryOnRequestSchema,
  result: TryOnResultSchema.optional(),
  error: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  idempotencyKey: z.string().min(1).optional(),
});

/** A validated try-on job record. */
export type TryOnJob = z.infer<typeof TryOnJobSchema>;

/**
 * Parse an unknown input into a validated {@link TryOnJob}.
 *
 * @throws {z.ZodError} if the input does not satisfy {@link TryOnJobSchema}.
 */
export function parseTryOnJob(input: unknown): TryOnJob {
  // fail-closed: a corrupted or partial job record is rejected, not trusted.
  return TryOnJobSchema.parse(input);
}

/** Non-throwing variant of {@link parseTryOnJob}. */
export function safeParseTryOnJob(input: unknown): z.SafeParseReturnType<unknown, TryOnJob> {
  return TryOnJobSchema.safeParse(input);
}

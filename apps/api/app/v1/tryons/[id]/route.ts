/**
 * GET /v1/tryons/[id] — fetch a stored try-on job by id.
 *
 * Returns the persisted {@link TryOnJob} as JSON, or a typed 404 {@link ApiError} when no job
 * with that id exists. Fail-closed: an unknown id never returns a fabricated job. CORS is applied
 * and an OPTIONS preflight is served. (Job ids are unguessable UUIDs; this Gate-0 read is not
 * tenant-scoped beyond that — a durable store would add an ownership check.)
 */

import { getRuntime } from '../../../_lib/runtime';
import { preflightResponse, jsonResponse } from '../../../_lib/http';

/** CORS preflight for the job-read endpoint. */
export async function OPTIONS(request: Request): Promise<Response> {
  return preflightResponse(request);
}

/** Return the stored job for `id`, or a typed 404 when it does not exist. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const job = getRuntime().jobs.get(id);
  if (job === undefined) {
    // fail-closed: an unknown id is a typed 404 body, not an empty 200.
    return jsonResponse({ error: 'not_found', message: 'no job exists for that id' }, 404, request);
  }
  return jsonResponse(job, 200, request);
}

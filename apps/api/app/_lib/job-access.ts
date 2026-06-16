/**
 * @tryit/api/_lib/job-access — tenant-scoped authorisation for reading a stored try-on job.
 *
 * GET /v1/tryons/:id must never leak one tenant's result to another (threat I1: cross-tenant
 * result leak / job enumeration). This module is the single fail-closed gate the read route uses:
 * given a presented bearer plaintext and a job, it answers ONE question — may THIS caller read
 * THIS job? — by verifying the key against the job's own tenant records with the same
 * {@link verifyApiKey} path the write pipeline uses (correct tenant + `tryon` scope + live key).
 *
 * Anti-enumeration: the route maps both "no such job" and "job belongs to another tenant" to the
 * SAME 404, so a caller can never distinguish a missing id from someone else's id. Keeping that
 * decision here (not in the route) means the indistinguishability is tested in one place.
 */

import { verifyApiKey } from '@tryit/security';
import { type TryOnJob } from '@tryit/contracts';
import { type Runtime } from './runtime';
import { TRYON_SCOPE } from './tenant-store';

/**
 * Decide whether the bearer `plaintext` is authorised to read `job`.
 *
 * Fail-closed at every branch: a missing/empty credential, an unknown tenant, or a key that does
 * not verify against the job's tenant (wrong secret, wrong tenant, missing scope, expired) all
 * return `false`. Only a key that {@link verifyApiKey} accepts for the job's OWN `tenantId` with
 * the `tryon` scope returns `true`. The job's tenant comes from the stored record, so a caller
 * cannot widen their reach by naming a different tenant.
 */
export function canReadJob(runtime: Runtime, plaintext: string | null, job: TryOnJob): boolean {
  if (plaintext === null || plaintext.length === 0) {
    return false; // fail-closed: no credential presented -> refuse.
  }
  const jobTenantId = job.request.tenantId;
  const tenant = runtime.tenantStore.getTenant(jobTenantId);
  if (tenant === undefined) {
    return false; // fail-closed: the job's tenant is unknown -> cannot be authorised.
  }
  for (const record of tenant.apiKeyRecords) {
    const result = verifyApiKey(plaintext, record, {
      tenantId: jobTenantId, // tenant isolation: key must belong to the JOB's tenant, not a caller-named one
      requiredScopes: [TRYON_SCOPE], // least privilege: the key must hold the tryon scope
    });
    if (result.ok) {
      return true;
    }
  }
  return false; // fail-closed: no record verified the presented key.
}

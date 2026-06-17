/**
 * Mutation-hardening test for the deterministic provider's debug log emission (L34):
 *  - StringLiteral `'deterministic.tryOn'` -> '' and ObjectLiteral `{ digest, tenantId }` -> {}.
 * A recording logger asserts the exact event name AND that the payload carries the request's
 * stable digest and tenantId, so a blanked event name or emptied payload is observable.
 */
import { describe, expect, it } from 'vitest';
import { DeterministicProvider } from './deterministic.js';
import { stableRequestHash } from '../internal/stable_request_hash.js';
import type { EngineLogger } from '../provider.js';
import { makeContext, makeRequest } from '../test_support/fixtures.js';

describe('DeterministicProvider (mutation-hardening)', () => {
  it('emits the exact deterministic.tryOn debug event with digest + tenantId', async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const logger: EngineLogger = {
      debug: (event, fields) => calls.push([event, fields]),
      warn: () => undefined,
      error: () => undefined,
    };
    const req = makeRequest({ tenantId: 'tenant-d' });
    await new DeterministicProvider().tryOn(req, makeContext({ logger }));
    // The digest is the deterministic stable hash of the same request — pin it exactly so an
    // emptied payload (`{}`) or blanked event name cannot survive.
    expect(calls).toContainEqual([
      'deterministic.tryOn',
      { digest: stableRequestHash(req), tenantId: 'tenant-d' },
    ]);
  });
});

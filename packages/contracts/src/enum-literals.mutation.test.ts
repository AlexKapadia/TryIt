/**
 * Mutation-hardening tests pinning EXACT enum literal values across audit / jobs / providers.
 *
 * Stryker blanks individual enum option strings to "" (StringLiteral mutant). The existing
 * suites iterate `Schema.options`, so a blanked option still round-trips and the mutant SURVIVES.
 * These tests assert each targeted literal BY ITS EXACT SPELLING (so a blanked option is no
 * longer accepted -> the parse fails -> the test fails) AND that the empty string "" is rejected
 * (so a blanked option would wrongly accept "" -> the test fails). Either way the mutant dies.
 */
import { describe, expect, it } from 'vitest';
import { AuditOutcomeSchema, parseAuditEvent, safeParseAuditEvent } from './audit.js';
import { TryOnJobStatusSchema, safeParseTryOnJob } from './jobs.js';
import { ProviderIdSchema, parseProviderId, safeParseProviderId } from './providers.js';

function baseEvent(): Record<string, unknown> {
  return {
    eventId: 'evt-1',
    ts: '2026-06-16T12:00:00.000Z',
    tenantId: 'tenant-1',
    actor: 'apikey-9',
    action: 'tryon.create',
    requestId: 'req-1',
    outcome: 'allow',
  };
}

function baseJob(): Record<string, unknown> {
  return {
    jobId: 'job-1',
    status: 'queued',
    request: {
      tenantId: 'tenant-1',
      shopperId: 'shopper-7',
      personImage: { kind: 'url', url: 'https://example.com/me.jpg' },
      productId: 'sku-42',
    },
    createdAt: '2026-06-16T12:00:00.000Z',
    updatedAt: '2026-06-16T12:00:01.000Z',
  };
}

describe('AuditOutcome enum literals are exact (kills "" mutants on deny / error)', () => {
  it("'deny' is a valid outcome and parses to exactly 'deny'", () => {
    expect(parseAuditEvent({ ...baseEvent(), outcome: 'deny' }).outcome).toBe('deny');
  });

  it("'error' is a valid outcome and parses to exactly 'error'", () => {
    expect(parseAuditEvent({ ...baseEvent(), outcome: 'error' }).outcome).toBe('error');
  });

  it('an empty-string outcome is rejected (a blanked option would wrongly accept it)', () => {
    expect(safeParseAuditEvent({ ...baseEvent(), outcome: '' }).success).toBe(false);
  });

  it("the outcome option set is exactly ['allow','deny','error']", () => {
    expect([...AuditOutcomeSchema.options]).toEqual(['allow', 'deny', 'error']);
  });
});

describe('TryOnJobStatus enum literals are exact (kills "" mutant on processing)', () => {
  it("'processing' is a valid status", () => {
    const parsed = safeParseTryOnJob({ ...baseJob(), status: 'processing' });
    expect(parsed.success).toBe(true);
  });

  it('an empty-string status is rejected', () => {
    expect(safeParseTryOnJob({ ...baseJob(), status: '' }).success).toBe(false);
  });

  it("the status option set is exactly ['queued','processing','succeeded','failed']", () => {
    expect([...TryOnJobStatusSchema.options]).toEqual([
      'queued',
      'processing',
      'succeeded',
      'failed',
    ]);
  });
});

describe('ProviderId enum literals are exact (kills "" mutants on google-vto / self-hosted)', () => {
  it("'google-vto' is a valid provider id and parses to exactly 'google-vto'", () => {
    expect(parseProviderId('google-vto')).toBe('google-vto');
  });

  it("'self-hosted' is a valid provider id and parses to exactly 'self-hosted'", () => {
    expect(parseProviderId('self-hosted')).toBe('self-hosted');
  });

  it('an empty-string provider id is rejected (a blanked option would wrongly accept it)', () => {
    expect(safeParseProviderId('').success).toBe(false);
  });

  it("the provider id option set is exactly the five known backends", () => {
    expect([...ProviderIdSchema.options]).toEqual([
      'fal',
      'replicate',
      'google-vto',
      'self-hosted',
      'deterministic',
    ]);
  });
});

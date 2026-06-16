/**
 * Tests for error-copy.ts. The mapping must be TOTAL over all seven contract error codes, each
 * with a non-empty humane message, a valid tone, and a valid recovery — derived from the
 * canonical ErrorCode enum (not a local copy) so a new code can't slip through untested.
 */

import { describe, it, expect } from 'vitest';
import { ErrorCodeSchema, type ErrorCode } from '@tryit/contracts';
import { presentationForCode, ERROR_PRESENTATION } from './error-copy.js';

const ALL_CODES = ErrorCodeSchema.options as readonly ErrorCode[];

describe('ERROR_PRESENTATION totality', () => {
  it('covers exactly the seven contract codes', () => {
    expect(ALL_CODES).toHaveLength(7);
    expect(Object.keys(ERROR_PRESENTATION).sort()).toEqual([...ALL_CODES].sort());
  });

  it.each(ALL_CODES)('%s -> non-empty message, valid tone + recovery', (code) => {
    const p = presentationForCode(code);
    expect(p.message.length).toBeGreaterThan(0);
    expect(['danger', 'warning']).toContain(p.tone);
    expect(['retry', 'close']).toContain(p.recovery);
    expect(p.recoveryLabel.length).toBeGreaterThan(0);
  });
});

describe('tone matches the inventory map (user-correctable=danger, system=warning)', () => {
  it.each([
    ['INVALID_INPUT', 'danger', 'retry'],
    ['PAYLOAD_TOO_LARGE', 'danger', 'retry'],
    ['UNAUTHORIZED', 'danger', 'close'],
    ['RATE_LIMITED', 'warning', 'retry'],
    ['BUDGET_EXCEEDED', 'warning', 'close'],
    ['KILL_SWITCH_ENGAGED', 'warning', 'close'],
    ['PROVIDER_ERROR', 'warning', 'retry'],
  ] as const)('%s -> tone %s, recovery %s', (code, tone, recovery) => {
    const p = presentationForCode(code);
    expect(p.tone).toBe(tone);
    expect(p.recovery).toBe(recovery);
  });

  it('all messages are distinct (no copy-paste duplication)', () => {
    const messages = ALL_CODES.map((c) => presentationForCode(c).message);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('fails closed to the PROVIDER_ERROR presentation for an unknown runtime code', () => {
    // Simulate a value outside the typed union reaching the lookup (defence in depth).
    const rogue = presentationForCode('SOMETHING_ELSE' as ErrorCode);
    expect(rogue).toBe(presentationForCode('PROVIDER_ERROR'));
  });
});

/**
 * Tests for provider-result validation: a contract-valid result passes through; an http (non
 * https) url, a negative cost, and a missing field each fail closed with an actionable error.
 */

import { describe, expect, it } from 'vitest';
import { validateProviderResult } from './validate_provider_result.js';
import { makeResult } from '../test_support/fixtures.js';

describe('validateProviderResult', () => {
  it('returns the result unchanged when it satisfies the contract', () => {
    const result = makeResult();
    expect(validateProviderResult(result, 'fal')).toEqual(result);
  });

  it('rejects a non-https result url (fail closed)', () => {
    const bad = makeResult({ resultImageUrl: 'http://cdn.example.com/r.png' });
    expect(() => validateProviderResult(bad, 'fal')).toThrow(/fal: malformed provider result/);
  });

  it('rejects a negative cost', () => {
    const bad = { ...makeResult(), costUsd: -1 };
    expect(() => validateProviderResult(bad, 'replicate')).toThrow(/malformed/);
  });

  it('rejects a missing required field', () => {
    const { resultImageUrl: _omit, ...rest } = makeResult();
    expect(() => validateProviderResult(rest, 'self-hosted')).toThrow(/self-hosted: malformed/);
  });
});

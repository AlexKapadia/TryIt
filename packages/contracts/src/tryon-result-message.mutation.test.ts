/**
 * Mutation-hardening test pinning the EXACT refine message on TryOnResultSchema.resultImageUrl.
 *
 * Two survivors live on the `.refine(isAcceptableResultImageUrl, { message: '...' })` call:
 *  - ObjectLiteral mutant blanks the options object to `{}` (drops the custom message), and
 *  - StringLiteral mutant blanks the message to "".
 * The existing tests only assert that a bad result URL THROWS, so the message text is never
 * checked and both mutants survive. Here we assert the exact message string on the failing
 * issue, so blanking it (to the Zod default or "") makes this fail — killing both mutants.
 */
import { describe, expect, it } from 'vitest';
import { safeParseTryOnResult } from './tryon.js';

function baseResult(): Record<string, unknown> {
  return {
    resultImageUrl: 'https://cdn.example.com/out.png',
    provider: 'fal',
    latencyMs: 1200,
    cached: false,
    costUsd: 0.03,
  };
}

describe('TryOnResult.resultImageUrl refine message is exact (mutation-hardening)', () => {
  it('an unsafe result url surfaces the EXACT custom message on the resultImageUrl path', () => {
    const result = safeParseTryOnResult({ ...baseResult(), resultImageUrl: 'http://x.io/o.png' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'resultImageUrl');
      expect(issue).toBeDefined();
      // Blanking the message to {} (Zod default "Invalid input") or "" would fail this.
      expect(issue?.message).toBe('result url must be https or a safe inline image data-url');
    }
  });

  it('a javascript: scheme result url surfaces the same exact custom message', () => {
    const result = safeParseTryOnResult({
      ...baseResult(),
      resultImageUrl: 'javascript:alert(1)',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('result url must be https or a safe inline image data-url');
    }
  });
});

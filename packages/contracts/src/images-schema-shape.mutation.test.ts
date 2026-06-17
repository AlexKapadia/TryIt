/**
 * Mutation-hardening tests for the schema shapes and refinement messages in images.ts.
 *
 * These kill three survivor classes that the field-agnostic existing tests miss:
 *  1. ObjectLiteral mutants that blank the `z.object({...})` SHAPE to `{}` — an empty shape
 *     strips every field, so a parsed ref would lose its data; we assert the parsed object
 *     RETAINS its exact fields (deep-equal), which an empty shape cannot satisfy.
 *  2. ObjectLiteral mutants that blank the `.refine(..., {message})` / `.regex(..., {message})`
 *     options object to `{}` — that drops the custom message; we assert the EXACT message.
 *  3. StringLiteral mutants that blank those message strings to "" — same exact-message assertion.
 *
 * Every assertion fails closed if the corresponding source token is mutated, giving them teeth.
 */
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  Base64ImageRefSchema,
  UrlImageRefSchema,
  parseImageRef,
  safeParseImageRef,
} from './images.js';

describe('images schema shapes retain their fields (kills shape -> {} mutants)', () => {
  it('UrlImageRefSchema parse RETAINS kind + url exactly (empty shape would strip them)', () => {
    const input = { kind: 'url' as const, url: 'https://cdn.example.com/me.jpg' };
    const parsed = UrlImageRefSchema.parse(input);
    // A blanked `z.object({})` strips all keys -> parsed would be {}. Deep-equal pins the shape.
    expect(parsed).toEqual(input);
    expect(parsed.url).toBe('https://cdn.example.com/me.jpg');
    expect(parsed.kind).toBe('url');
  });

  it('UrlImageRefSchema still enforces the url field (empty shape would accept a bare object)', () => {
    // With the real shape, a missing url is rejected. An empty `z.object({})` would accept {}.
    expect(UrlImageRefSchema.safeParse({ kind: 'url' }).success).toBe(false);
  });

  it('Base64ImageRefSchema parse RETAINS kind + mimeType + data exactly', () => {
    const input = { kind: 'base64' as const, mimeType: 'image/png' as const, data: 'aGVsbG8=' };
    const parsed = Base64ImageRefSchema.parse(input);
    expect(parsed).toEqual(input);
    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.data).toBe('aGVsbG8=');
  });

  it('Base64ImageRefSchema still enforces mimeType + data (empty shape would accept a bare object)', () => {
    expect(Base64ImageRefSchema.safeParse({ kind: 'base64' }).success).toBe(false);
  });

  it('parseImageRef round-trips a base64 ref with NO field loss', () => {
    const input = { kind: 'base64' as const, mimeType: 'image/webp' as const, data: 'aGVsbG8=' };
    expect(parseImageRef(input)).toEqual(input);
  });
});

describe('images refinement messages are exact (kills message {} / "" mutants)', () => {
  it('non-https url surfaces the EXACT "image url must use https" message', () => {
    const result = safeParseImageRef({ kind: 'url', url: 'http://cdn.example.com/me.jpg' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      // Exact-message assertion: a blanked {message} object or "" literal would not produce this.
      expect(messages).toContain('image url must use https');
    }
  });

  it('non-base64 data surfaces the EXACT "data must be valid base64" message', () => {
    const result = safeParseImageRef({ kind: 'base64', mimeType: 'image/png', data: 'not*b64!' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('data must be valid base64');
    }
  });

  it('oversized data surfaces the EXACT "image exceeds maximum allowed size" message', () => {
    // 9 MiB decoded > the 8 MiB cap: 'A' * ceil(9MiB*4/3) yields a payload over the limit.
    const data = Buffer.alloc(9 * 1024 * 1024, 0).toString('base64');
    const result = safeParseImageRef({ kind: 'base64', mimeType: 'image/jpeg', data });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('image exceeds maximum allowed size');
    }
  });

  it('a clean valid ref produces NO error message (sanity: messages only fire on failure)', () => {
    expect(() =>
      parseImageRef({ kind: 'url', url: 'https://ok.example.com/a.png' }),
    ).not.toThrow(ZodError);
  });
});

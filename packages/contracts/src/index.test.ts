import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseTryOnRequest, TryOnRequestSchema, type TryOnRequest } from './index.js';

/** A minimal valid request used as a baseline that individual tests mutate. */
function baseRequest(): Record<string, unknown> {
  return {
    tenantId: 'tenant-1',
    shopperId: 'shopper-7',
    personImage: { kind: 'url', value: 'https://example.com/me.jpg' },
    productId: 'sku-42',
  };
}

describe('parseTryOnRequest', () => {
  it('parses a valid url-based request and applies the default category', () => {
    const result = parseTryOnRequest(baseRequest());

    const expected: TryOnRequest = {
      tenantId: 'tenant-1',
      shopperId: 'shopper-7',
      personImage: { kind: 'url', value: 'https://example.com/me.jpg' },
      productId: 'sku-42',
      category: 'apparel',
    };
    expect(result).toEqual(expected);
  });

  it('accepts a base64 person image', () => {
    const result = parseTryOnRequest({
      ...baseRequest(),
      personImage: { kind: 'base64', value: 'aGVsbG8=' },
    });
    expect(result.personImage).toEqual({ kind: 'base64', value: 'aGVsbG8=' });
  });

  it('preserves an explicitly provided category instead of defaulting', () => {
    const result = parseTryOnRequest({ ...baseRequest(), category: 'apparel' });
    expect(result.category).toBe('apparel');
  });

  it('passes through an optional params object', () => {
    const result = parseTryOnRequest({ ...baseRequest(), params: { strength: 0.8 } });
    expect(result.params).toEqual({ strength: 0.8 });
  });

  it('leaves params undefined when omitted', () => {
    const result = parseTryOnRequest(baseRequest());
    expect(result.params).toBeUndefined();
  });

  it('throws when tenantId is missing', () => {
    const { tenantId: _omit, ...withoutTenant } = baseRequest();
    expect(() => parseTryOnRequest(withoutTenant)).toThrow(ZodError);
  });

  it('throws when tenantId is an empty string (boundary: min length 1)', () => {
    expect(() => parseTryOnRequest({ ...baseRequest(), tenantId: '' })).toThrow(ZodError);
  });

  it('accepts a single-character tenantId (boundary: exactly min length 1)', () => {
    const result = parseTryOnRequest({ ...baseRequest(), tenantId: 'x' });
    expect(result.tenantId).toBe('x');
  });

  it('throws when productId is an empty string', () => {
    expect(() => parseTryOnRequest({ ...baseRequest(), productId: '' })).toThrow(ZodError);
  });

  it('throws when shopperId is an empty string', () => {
    expect(() => parseTryOnRequest({ ...baseRequest(), shopperId: '' })).toThrow(ZodError);
  });

  it('rejects an unsupported category value', () => {
    expect(() => parseTryOnRequest({ ...baseRequest(), category: 'footwear' })).toThrow(ZodError);
  });

  it('rejects an unsupported personImage.kind', () => {
    expect(() =>
      parseTryOnRequest({ ...baseRequest(), personImage: { kind: 'file', value: 'x' } }),
    ).toThrow(ZodError);
  });

  it('rejects an empty personImage.value (boundary: min length 1)', () => {
    expect(() =>
      parseTryOnRequest({ ...baseRequest(), personImage: { kind: 'url', value: '' } }),
    ).toThrow(ZodError);
  });

  it('rejects a non-object input', () => {
    expect(() => parseTryOnRequest('not-an-object')).toThrow(ZodError);
    expect(() => parseTryOnRequest(null)).toThrow(ZodError);
  });

  it('safeParse reports the failing path for a missing tenantId', () => {
    const { tenantId: _omit, ...withoutTenant } = baseRequest();
    const parsed = TryOnRequestSchema.safeParse(withoutTenant);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['tenantId']);
    }
  });
});

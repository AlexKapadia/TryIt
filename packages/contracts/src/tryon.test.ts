import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import fc from 'fast-check';
import {
  parseTryOnRequest,
  parseTryOnResult,
  safeParseTryOnRequest,
  safeParseTryOnResult,
  TryOnRequestSchema,
  type TryOnRequest,
} from './tryon.js';

/** A minimal valid request used as a baseline that individual tests mutate. */
function baseRequest(): Record<string, unknown> {
  return {
    tenantId: 'tenant-1',
    shopperId: 'shopper-7',
    personImage: { kind: 'url', url: 'https://example.com/me.jpg' },
    productId: 'sku-42',
  };
}

/** A minimal valid result used as a baseline that individual tests mutate. */
function baseResult(): Record<string, unknown> {
  return {
    resultImageUrl: 'https://cdn.example.com/out.png',
    provider: 'fal',
    latencyMs: 1200,
    cached: false,
    costUsd: 0.03,
  };
}

describe('parseTryOnRequest', () => {
  it('parses a valid url-based request and applies the default category', () => {
    const result = parseTryOnRequest(baseRequest());
    const expected: TryOnRequest = {
      tenantId: 'tenant-1',
      shopperId: 'shopper-7',
      personImage: { kind: 'url', url: 'https://example.com/me.jpg' },
      productId: 'sku-42',
      category: 'apparel',
    };
    expect(result).toEqual(expected);
  });

  it('accepts a base64 person image', () => {
    const result = parseTryOnRequest({
      ...baseRequest(),
      personImage: { kind: 'base64', mimeType: 'image/png', data: 'aGVsbG8=' },
    });
    expect(result.personImage).toEqual({ kind: 'base64', mimeType: 'image/png', data: 'aGVsbG8=' });
  });

  it('accepts params with seed, garmentImage and numSamples', () => {
    const result = parseTryOnRequest({
      ...baseRequest(),
      params: {
        seed: 7,
        garmentImage: { kind: 'url', url: 'https://example.com/shirt.jpg' },
        numSamples: 2,
      },
    });
    expect(result.params).toEqual({
      seed: 7,
      garmentImage: { kind: 'url', url: 'https://example.com/shirt.jpg' },
      numSamples: 2,
    });
  });

  it('leaves params undefined when omitted', () => {
    expect(parseTryOnRequest(baseRequest()).params).toBeUndefined();
  });

  it('rejects a non-integer seed', () => {
    expect(() => parseTryOnRequest({ ...baseRequest(), params: { seed: 1.5 } })).toThrow(ZodError);
  });

  it('rejects numSamples = 0 (boundary: just-under min 1)', () => {
    expect(() => parseTryOnRequest({ ...baseRequest(), params: { numSamples: 0 } })).toThrow(
      ZodError,
    );
  });

  it('accepts numSamples = 1 (boundary: at min)', () => {
    expect(parseTryOnRequest({ ...baseRequest(), params: { numSamples: 1 } }).params?.numSamples).toBe(
      1,
    );
  });

  it('accepts numSamples = 4 (boundary: at max)', () => {
    expect(parseTryOnRequest({ ...baseRequest(), params: { numSamples: 4 } }).params?.numSamples).toBe(
      4,
    );
  });

  it('rejects numSamples = 5 (boundary: just-over max 4)', () => {
    expect(() => parseTryOnRequest({ ...baseRequest(), params: { numSamples: 5 } })).toThrow(
      ZodError,
    );
  });

  it('throws when tenantId is missing', () => {
    const { tenantId: _omit, ...rest } = baseRequest();
    expect(() => parseTryOnRequest(rest)).toThrow(ZodError);
  });

  it('throws when shopperId is missing', () => {
    const { shopperId: _omit, ...rest } = baseRequest();
    expect(() => parseTryOnRequest(rest)).toThrow(ZodError);
  });

  it('throws when personImage is missing', () => {
    const { personImage: _omit, ...rest } = baseRequest();
    expect(() => parseTryOnRequest(rest)).toThrow(ZodError);
  });

  it('throws when productId is missing', () => {
    const { productId: _omit, ...rest } = baseRequest();
    expect(() => parseTryOnRequest(rest)).toThrow(ZodError);
  });

  it('throws on empty tenantId / shopperId / productId (boundary: min length 1)', () => {
    expect(() => parseTryOnRequest({ ...baseRequest(), tenantId: '' })).toThrow(ZodError);
    expect(() => parseTryOnRequest({ ...baseRequest(), shopperId: '' })).toThrow(ZodError);
    expect(() => parseTryOnRequest({ ...baseRequest(), productId: '' })).toThrow(ZodError);
  });

  it('accepts single-character ids (boundary: exactly min length 1)', () => {
    const result = parseTryOnRequest({ ...baseRequest(), tenantId: 'x', shopperId: 'y', productId: 'z' });
    expect([result.tenantId, result.shopperId, result.productId]).toEqual(['x', 'y', 'z']);
  });

  it('rejects an unsupported category value', () => {
    expect(() => parseTryOnRequest({ ...baseRequest(), category: 'footwear' })).toThrow(ZodError);
  });

  it('rejects a non-https person image url', () => {
    expect(() =>
      parseTryOnRequest({ ...baseRequest(), personImage: { kind: 'url', url: 'http://x.io/a.jpg' } }),
    ).toThrow(ZodError);
  });

  it('safeParse reports the failing path for a missing tenantId', () => {
    const { tenantId: _omit, ...rest } = baseRequest();
    const parsed = safeParseTryOnRequest(rest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['tenantId']);
    }
  });

  it('rejects a non-object input', () => {
    expect(() => parseTryOnRequest('nope')).toThrow(ZodError);
    expect(() => parseTryOnRequest(null)).toThrow(ZodError);
  });

  it('property: any well-formed request parses and round-trips through the schema', () => {
    fc.assert(
      fc.property(
        fc.record({
          tenantId: fc.string({ minLength: 1 }),
          shopperId: fc.string({ minLength: 1 }),
          productId: fc.string({ minLength: 1 }),
        }),
        (ids) => {
          const parsed = TryOnRequestSchema.parse({
            ...ids,
            personImage: { kind: 'url', url: 'https://example.com/p.jpg' },
          });
          expect(parsed.category).toBe('apparel');
          expect(parsed.tenantId).toBe(ids.tenantId);
        },
      ),
    );
  });
});

describe('parseTryOnResult', () => {
  it('parses a valid result', () => {
    expect(parseTryOnResult(baseResult())).toEqual({ ...baseResult() });
  });

  it('accepts cached results with zero cost', () => {
    expect(parseTryOnResult({ ...baseResult(), cached: true, costUsd: 0 }).cached).toBe(true);
  });

  it('rejects a negative latencyMs (boundary: just-under 0)', () => {
    expect(() => parseTryOnResult({ ...baseResult(), latencyMs: -1 })).toThrow(ZodError);
  });

  it('accepts latencyMs = 0 (boundary: at 0)', () => {
    expect(parseTryOnResult({ ...baseResult(), latencyMs: 0 }).latencyMs).toBe(0);
  });

  it('rejects a negative costUsd (boundary: just-under 0)', () => {
    expect(() => parseTryOnResult({ ...baseResult(), costUsd: -0.01 })).toThrow(ZodError);
  });

  it('rejects http / file / javascript result urls (fail-closed scheme allow-list)', () => {
    for (const bad of ['http://x.io/o.png', 'file:///etc/passwd', 'javascript:alert(1)']) {
      expect(() => parseTryOnResult({ ...baseResult(), resultImageUrl: bad })).toThrow(ZodError);
    }
  });

  it('rejects a bare "https://" with no host (boundary: malformed https url)', () => {
    expect(() => parseTryOnResult({ ...baseResult(), resultImageUrl: 'https://' })).toThrow(
      ZodError,
    );
  });

  it('accepts an inline data:image/svg+xml base64 url (renderable offline result)', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
    const url = `data:image/svg+xml;base64,${svg}`;
    expect(parseTryOnResult({ ...baseResult(), resultImageUrl: url }).resultImageUrl).toBe(url);
  });

  it('accepts inline data: urls for every allow-listed raster MIME type', () => {
    for (const mime of ['png', 'jpeg', 'webp']) {
      const url = `data:image/${mime};base64,aGVsbG8=`;
      expect(parseTryOnResult({ ...baseResult(), resultImageUrl: url }).resultImageUrl).toBe(url);
    }
  });

  it('rejects data: urls of disallowed mime types (text/html, image/gif)', () => {
    for (const bad of ['data:text/html;base64,aGVsbG8=', 'data:image/gif;base64,aGVsbG8=']) {
      expect(() => parseTryOnResult({ ...baseResult(), resultImageUrl: bad })).toThrow(ZodError);
    }
  });

  it('rejects a data:image url with an empty / non-base64 payload (boundary)', () => {
    for (const bad of ['data:image/png;base64,', 'data:image/png;base64,not base64!!', 'data:image/png,raw']) {
      expect(() => parseTryOnResult({ ...baseResult(), resultImageUrl: bad })).toThrow(ZodError);
    }
  });

  it('accepts a data url exactly at the size cap and rejects one just over it (boundary)', () => {
    const prefix = 'data:image/png;base64,';
    const atCap = prefix + 'A'.repeat(2 * 1024 * 1024 - prefix.length);
    expect(atCap.length).toBe(2 * 1024 * 1024); // boundary-exact: total length == cap.
    expect(parseTryOnResult({ ...baseResult(), resultImageUrl: atCap }).resultImageUrl).toBe(atCap);
    const overCap = atCap + 'A';
    expect(() => parseTryOnResult({ ...baseResult(), resultImageUrl: overCap })).toThrow(ZodError);
  });

  it('throws when provider is empty', () => {
    expect(() => parseTryOnResult({ ...baseResult(), provider: '' })).toThrow(ZodError);
  });

  it('safeParse fails for a missing cached flag', () => {
    const { cached: _omit, ...rest } = baseResult();
    expect(safeParseTryOnResult(rest).success).toBe(false);
  });
});

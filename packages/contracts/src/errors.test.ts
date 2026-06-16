import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import fc from 'fast-check';
import {
  ERROR_CODE_HTTP_STATUS,
  ErrorCodeSchema,
  FAIL_CLOSED_HTTP_STATUS,
  httpStatusForErrorCode,
  makeApiError,
  parseApiError,
  safeParseApiError,
  type ErrorCode,
} from './errors.js';

describe('httpStatusForErrorCode', () => {
  it('maps each documented code to its specific status', () => {
    expect(httpStatusForErrorCode('INVALID_INPUT')).toBe(400);
    expect(httpStatusForErrorCode('UNAUTHORIZED')).toBe(401);
    expect(httpStatusForErrorCode('BUDGET_EXCEEDED')).toBe(402);
    expect(httpStatusForErrorCode('PAYLOAD_TOO_LARGE')).toBe(413);
    expect(httpStatusForErrorCode('RATE_LIMITED')).toBe(429);
    expect(httpStatusForErrorCode('PROVIDER_ERROR')).toBe(502);
    expect(httpStatusForErrorCode('KILL_SWITCH_ENGAGED')).toBe(503);
  });

  it('is total: every ErrorCode maps to a 4xx or 5xx status', () => {
    // Drives the mapping from the enum's own option list so a new code with no status fails here.
    for (const code of ErrorCodeSchema.options) {
      const status = httpStatusForErrorCode(code);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThanOrEqual(599);
    }
  });

  it('fails closed to 500 for a runtime code outside the union', () => {
    // Simulate a corrupted/unknown code reaching the resolver at runtime.
    expect(httpStatusForErrorCode('TOTALLY_UNKNOWN' as ErrorCode)).toBe(FAIL_CLOSED_HTTP_STATUS);
  });

  it('the static mapping has exactly one entry per enum option', () => {
    expect(Object.keys(ERROR_CODE_HTTP_STATUS).sort()).toEqual([...ErrorCodeSchema.options].sort());
  });

  it('property: every code in the enum resolves to a 4xx/5xx (totality, no gaps)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ErrorCodeSchema.options), (code) => {
        const status = httpStatusForErrorCode(code);
        expect(status >= 400 && status <= 599).toBe(true);
      }),
    );
  });
});

describe('makeApiError', () => {
  it('derives httpStatus from the code so they cannot disagree', () => {
    expect(makeApiError('RATE_LIMITED', 'slow down')).toEqual({
      code: 'RATE_LIMITED',
      message: 'slow down',
      httpStatus: 429,
    });
  });

  it('produces a value that passes ApiError validation for every code', () => {
    for (const code of ErrorCodeSchema.options) {
      expect(safeParseApiError(makeApiError(code, 'msg')).success).toBe(true);
    }
  });
});

describe('parseApiError', () => {
  it('parses a valid api error', () => {
    expect(parseApiError({ code: 'INVALID_INPUT', message: 'bad', httpStatus: 400 })).toEqual({
      code: 'INVALID_INPUT',
      message: 'bad',
      httpStatus: 400,
    });
  });

  it('rejects an unknown code', () => {
    expect(() => parseApiError({ code: 'NOPE', message: 'x', httpStatus: 400 })).toThrow(ZodError);
  });

  it('rejects an empty message (boundary: min length 1)', () => {
    expect(() => parseApiError({ code: 'INVALID_INPUT', message: '', httpStatus: 400 })).toThrow(
      ZodError,
    );
  });

  it('rejects httpStatus = 399 (boundary: just-under min 400)', () => {
    expect(() => parseApiError({ code: 'INVALID_INPUT', message: 'x', httpStatus: 399 })).toThrow(
      ZodError,
    );
  });

  it('accepts httpStatus = 400 and 599 (boundaries: at min/max)', () => {
    expect(parseApiError({ code: 'INVALID_INPUT', message: 'x', httpStatus: 400 }).httpStatus).toBe(
      400,
    );
    expect(parseApiError({ code: 'PROVIDER_ERROR', message: 'x', httpStatus: 599 }).httpStatus).toBe(
      599,
    );
  });

  it('rejects httpStatus = 600 (boundary: just-over max 599)', () => {
    expect(() => parseApiError({ code: 'INVALID_INPUT', message: 'x', httpStatus: 600 })).toThrow(
      ZodError,
    );
  });

  it('rejects a non-integer httpStatus', () => {
    expect(() => parseApiError({ code: 'INVALID_INPUT', message: 'x', httpStatus: 400.5 })).toThrow(
      ZodError,
    );
  });
});

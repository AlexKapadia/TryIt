/**
 * Adversarial + property tests for canonical (stable) JSON serialization.
 *
 * The load-bearing property is order-independence (object key ordering must not
 * change output) plus fail-closed rejection of unrepresentable values that would
 * otherwise let distinct inputs collide.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { canonicalJsonStringify, type JsonValue } from './canonical-json.js';

describe('canonicalJsonStringify — primitives', () => {
  it('serializes primitives exactly like JSON for finite scalars', () => {
    expect(canonicalJsonStringify(null)).toBe('null');
    expect(canonicalJsonStringify(true)).toBe('true');
    expect(canonicalJsonStringify(false)).toBe('false');
    expect(canonicalJsonStringify(0)).toBe('0');
    expect(canonicalJsonStringify(-1.5)).toBe('-1.5');
    expect(canonicalJsonStringify('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it('distinguishes 0 from "0" from false (no type confusion)', () => {
    const forms = new Set([
      canonicalJsonStringify(0),
      canonicalJsonStringify('0'),
      canonicalJsonStringify(false),
    ]);
    expect(forms.size).toBe(3);
  });
});

describe('canonicalJsonStringify — key ordering invariance', () => {
  it('produces identical output regardless of object key insertion order', () => {
    const a: JsonValue = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b: JsonValue = { c: { y: 2, z: 1 }, a: 2, b: 1 };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    expect(canonicalJsonStringify(a)).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
  });

  it('property: shuffling object keys never changes the output', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.integer(), { minKeys: 0, maxKeys: 12 }),
        (obj) => {
          // Reconstruct with Object.defineProperty so adversarial keys like
          // "__proto__" become real OWN properties (bracket assignment would
          // mutate the prototype instead and silently drop the key).
          const shuffled: Record<string, number> = {};
          for (const k of Object.keys(obj).reverse()) {
            Object.defineProperty(shuffled, k, {
              value: obj[k],
              enumerable: true,
              writable: true,
              configurable: true,
            });
          }
          return canonicalJsonStringify(obj as JsonValue) === canonicalJsonStringify(shuffled);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('preserves array order (arrays are sequence-semantic, not sorted)', () => {
    expect(canonicalJsonStringify([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJsonStringify([1, 2, 3])).not.toBe(canonicalJsonStringify([3, 2, 1]));
  });
});

describe('canonicalJsonStringify — fail-closed on unrepresentable values', () => {
  it('throws on non-finite numbers rather than coercing to null', () => {
    expect(() => canonicalJsonStringify(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJsonStringify(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => canonicalJsonStringify(Number.NEGATIVE_INFINITY)).toThrow(TypeError);
  });

  it('throws on undefined members rather than silently dropping them', () => {
    // Cast through unknown: the type system forbids this, but adversarial callers may not be typed.
    const sneaky = { a: 1, b: undefined } as unknown as JsonValue;
    expect(() => canonicalJsonStringify(sneaky)).toThrow(/undefined/);
  });

  it('throws on top-level unsupported types', () => {
    expect(() => canonicalJsonStringify(undefined as unknown as JsonValue)).toThrow(TypeError);
    expect(() => canonicalJsonStringify((() => 1) as unknown as JsonValue)).toThrow(TypeError);
    expect(() => canonicalJsonStringify(10n as unknown as JsonValue)).toThrow(TypeError);
  });
});

describe('canonicalJsonStringify — nested determinism property', () => {
  const jsonArb: fc.Arbitrary<JsonValue> = fc.letrec<{ node: JsonValue }>((tie) => ({
    node: fc.oneof(
      { depthSize: 'small' },
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.array(tie('node'), { maxLength: 4 }),
      fc.dictionary(fc.string(), tie('node'), { maxKeys: 4 }),
    ),
  })).node;

  it('property: output is parseable and round-trips to an equivalent value', () => {
    fc.assert(
      fc.property(jsonArb, (value) => {
        const s = canonicalJsonStringify(value);
        // Equivalent under standard JSON semantics.
        expect(JSON.parse(s)).toEqual(JSON.parse(JSON.stringify(value)));
      }),
      { numRuns: 300 },
    );
  });
});

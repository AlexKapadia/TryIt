/**
 * @tryit/cache — canonical (stable) JSON serialization.
 *
 * Why this exists: cache keys are derived by hashing request material, so the
 * serialization of structured params MUST be deterministic and order-independent.
 * `JSON.stringify` preserves insertion order of object keys, which means two
 * semantically-identical param objects with differently-ordered keys would hash
 * to different cache keys (a cache miss that should have been a hit). This module
 * produces a canonical form: object keys are recursively sorted, so ordering can
 * never change the output.
 *
 * Security/correctness invariant: the output is a pure function of the value's
 * content, never of its construction order. Non-finite numbers and unsupported
 * types are rejected (fail-closed) rather than silently coerced to `null`, which
 * is what `JSON.stringify` does and which would let distinct inputs collide.
 */

/** A value that can appear inside canonicalizable cache params. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Serialize a JSON value to a canonical string with recursively sorted object keys.
 *
 * Inputs: any JsonValue. Arrays preserve order (order is semantic for arrays);
 * object keys are sorted lexicographically by UTF-16 code unit.
 * Output: a deterministic JSON string.
 * Failure modes: throws on `undefined`, functions, symbols, bigint, and on
 * non-finite numbers (NaN, ±Infinity) — these have no faithful JSON form, and
 * silently dropping/coercing them would let distinct inputs produce the same key.
 */
export function canonicalJsonStringify(value: JsonValue): string {
  return encode(value);
}

function encode(value: JsonValue): string {
  if (value === null) {
    return 'null';
  }

  const t = typeof value;

  if (t === 'string') {
    return JSON.stringify(value);
  }

  if (t === 'number') {
    // fail-closed: non-finite numbers have no JSON representation; reject rather
    // than letting JSON.stringify coerce them to `null` and cause collisions.
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonicalJsonStringify: non-finite number ${String(value)}`);
    }
    return JSON.stringify(value);
  }

  if (t === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    return `[${value.map(encode).join(',')}]`;
  }

  if (t === 'object') {
    const obj = value as { [key: string]: JsonValue };
    const keys = Object.keys(obj).sort();
    const members = keys.map((key) => {
      const v = obj[key];
      // fail-closed: `undefined` members are dropped by JSON.stringify, which
      // would make {a:1,b:undefined} and {a:1} collide. Reject instead.
      if (v === undefined) {
        throw new TypeError(`canonicalJsonStringify: undefined value at key ${JSON.stringify(key)}`);
      }
      return `${JSON.stringify(key)}:${encode(v)}`;
    });
    return `{${members.join(',')}}`;
  }

  // fail-closed: undefined, function, symbol, bigint — unrepresentable.
  throw new TypeError(`canonicalJsonStringify: unsupported value of type ${t}`);
}

/**
 * Typed, null-safe accessors over decoded JSON.
 *
 * Mirrors the Python SDK's `_data` / PHP `Support\Data` helpers: model hydration
 * stays free of scattered casts and, crucially, **never throws** on a surprising
 * payload — a missing or wrong-typed field falls back to a sensible default.
 * Internal helper, not part of the public API.
 */

export type JsonObject = Record<string, unknown>;

/** True for a JSON object (a non-null, non-array plain object). */
export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Return `value` when it is a real string, else `dflt` (never stringifies numbers/bools). */
export function asString(value: unknown, dflt = ''): string {
  return typeof value === 'string' ? value : dflt;
}

export function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Coerce numeric values to a whole number (truncating toward zero), else `null`.
 *
 * `boolean` is rejected (PHP `is_numeric(true)` is false, so booleans must not
 * become `1`/`0`). Numeric strings and floats are truncated (`"3.9"` -> `3`).
 * A JS `number` is a 64-bit double whose integers are exact only up to 2^53, so a
 * value beyond the safe-integer range (e.g. an oversized file size, or a numeric
 * string like `"9007199254740993"` that `Number()` rounds) has silently lost
 * precision; rather than hydrate a misleading integer we return `null` (absence) —
 * the fixed-width siblings (Java `long` / .NET `long?`) do the same for out-of-range
 * input. Real file sizes never approach 2^53 bytes (~9 PB), so this only fires on
 * corrupt/hostile payloads.
 */
export function nullableNumber(value: unknown): number | null {
  if (typeof value === 'boolean') return null;
  if (typeof value === 'number') return safeWhole(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    return safeWhole(Number(trimmed));
  }
  return null;
}

/** Truncate to a whole number, or `null` when non-finite or outside the exact-integer range. */
function safeWhole(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const whole = Math.trunc(value);
  return Number.isSafeInteger(whole) ? whole : null;
}

export function asBool(value: unknown, dflt = false): boolean {
  return typeof value === 'boolean' ? value : dflt;
}

/** Return `value` when it is a JSON object, else an empty object. */
export function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

/**
 * Return a list of values. A JSON array passes through; a JSON object is reduced
 * to its values (mirrors PHP `array_values`); anything else yields `[]`.
 */
export function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isObject(value)) return Object.values(value);
  return [];
}

/** Build a model from each object element of `value`; skip non-object elements. */
export function mapObjects<T>(value: unknown, factory: (o: JsonObject) => T): T[] {
  return asList(value)
    .filter(isObject)
    .map((item) => factory(item));
}

export function stringList(value: unknown): string[] {
  return asList(value).filter((item): item is string => typeof item === 'string');
}

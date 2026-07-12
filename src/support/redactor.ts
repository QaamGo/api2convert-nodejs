/**
 * Credential redaction for cloud connectors.
 *
 * Cloud `credentials` ride in the plaintext request body, so they must never surface where
 * a value object or an SDK-emitted string could leak them. This helper centralizes the
 * masks the contract mandates:
 *
 * - the **whole `credentials` object** collapses to {@link REDACTION_MARKER} on every
 *   object-inspection path (`util.inspect` / `toString`);
 * - any `parameters` leaf whose key contains a sensitive token
 *   ({@link SENSITIVE_SUBSTRINGS}, case-insensitive substring) collapses to the marker;
 * - the decoded error body is deep-walked ({@link redactBody}) as belt-and-suspenders —
 *   the API only ever echoes field *names*, never a credential *value*, but a future
 *   server/proxy change must not be able to leak one.
 *
 * Internal helper, not part of the public API.
 */

import { isObject, type JsonObject } from './data.js';

/** The fixed, fleet-wide redaction marker (D9). */
export const REDACTION_MARKER = '[REDACTED]';

/**
 * Case-insensitive substrings that mark a key as carrying a secret. A key containing any
 * of these has its whole value masked.
 */
const SENSITIVE_SUBSTRINGS: readonly string[] = [
  'token',
  'password',
  'passwd',
  'secret',
  'key',
  'keyfile',
  'credential',
  'passphrase',
  'sas',
  'sig',
  'signature',
];

/** Whether a key name marks its value as sensitive (case-insensitive substring match). */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_SUBSTRINGS.some((needle) => lower.includes(needle));
}

/**
 * Mask sensitive leaves of a `parameters` map: any key matching {@link isSensitiveKey}
 * has its value replaced by {@link REDACTION_MARKER}; nested maps/arrays are walked
 * recursively. Non-secret keys (`bucket`, `host`, `file`, `container`, `projectid`, …) are
 * left untouched.
 */
export function redactParameters(parameters: JsonObject): JsonObject {
  return redactValue(parameters) as JsonObject;
}

/**
 * Deep-walk a decoded error body and mask the value of every sensitive key (including a
 * flattened/dotted key like `input.0.credentials.secretaccesskey`) to {@link REDACTION_MARKER}.
 */
export function redactBody(body: JsonObject): JsonObject {
  return redactValue(body) as JsonObject;
}

/** Recursively mask sensitive keys in an arbitrary decoded JSON value. */
function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (isObject(value)) {
    const out: JsonObject = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? REDACTION_MARKER : redactValue(val);
    }
    return out;
  }
  return value;
}

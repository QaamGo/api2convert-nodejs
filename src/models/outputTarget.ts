/**
 * A cloud-storage delivery target for a conversion's output:
 * `{ type:<provider>, parameters, credentials }`.
 *
 * Attach one (or more) to a conversion via `client.convert(..., { outputTargets: [...] })` /
 * `convertAsync(...)`, or inline in a raw `jobs().create()` conversion map. When any output
 * target is set the conversion delivers straight to your storage and produces **no** local
 * output — so `convert()` returns the completed job without downloading.
 *
 * This wave ships the **generic** shape only (`type` + free-form `parameters`/`credentials`); the
 * per-provider output keys live in a separate service and diverge per provider, so there are no
 * per-provider output factories yet.
 *
 * Serialization ({@link OutputTarget.toDict}) emits `{ type, parameters, credentials }` and
 * **omits `status`** (server-set, read-only). On read ({@link outputTargetFromDict}) `type`,
 * `parameters` and `status` round-trip as raw values; `credentials` are **never** surfaced (the
 * API returns them empty). `credentials` ride in the plaintext body, so both the `util.inspect`
 * and `toString` paths mask the whole object to `[REDACTED]`.
 */

import { inspect } from 'node:util';

import { CloudProvider } from '../enums/cloudProvider.js';
import { asObject, asString, nullableString, type JsonObject } from '../support/data.js';
import { REDACTION_MARKER, redactParameters } from '../support/redactor.js';

export class OutputTarget {
  /** The provider string (a {@link CloudProvider} value, or a forward-compat string). */
  readonly type: string;
  /** Delivery locator keys (provider-specific). */
  readonly parameters: JsonObject;
  /** Secret keys (never surfaced on read). */
  readonly credentials: JsonObject;
  /** Server-set delivery status on read (`waiting|uploading|completed|failed`); never sent on create. */
  readonly status: string | null;

  constructor(
    type: CloudProvider | string,
    parameters: JsonObject = {},
    credentials: JsonObject = {},
    status: string | null = null,
  ) {
    this.type = type;
    this.parameters = parameters;
    this.credentials = credentials;
    this.status = status;
  }

  /** Generic constructor accepting a typed provider or a forward-compat string. */
  static of(
    type: CloudProvider | string,
    parameters: JsonObject = {},
    credentials: JsonObject = {},
  ): OutputTarget {
    return new OutputTarget(type, parameters, credentials);
  }

  /**
   * The wire descriptor sent on create — `{ type, parameters, credentials }`, with `status`
   * omitted (it is server-set and read-only).
   */
  toDict(): JsonObject {
    return {
      type: this.type,
      parameters: this.parameters,
      credentials: this.credentials,
    };
  }

  /**
   * Human-readable form with credentials masked — safe to log.
   */
  toString(): string {
    return (
      `OutputTarget(type=${this.type}, ` +
      `parameters=${JSON.stringify(redactParameters(this.parameters))}, ` +
      `credentials=${REDACTION_MARKER}, status=${this.status ?? 'null'})`
    );
  }

  /** `util.inspect` / `console.log` render the same masked form. */
  [inspect.custom](): string {
    return this.toString();
  }
}

/**
 * Hydrate from a `GET /jobs/{id}` `output_target[]` element. `type`/`status` stay raw strings (an
 * unknown provider round-trips untyped); `credentials` are deliberately not surfaced.
 */
export function outputTargetFromDict(data: JsonObject): OutputTarget {
  return new OutputTarget(
    asString(data.type),
    asObject(data.parameters),
    {},
    nullableString(data.status),
  );
}

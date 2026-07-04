import { asString, nullableString, type JsonObject } from '../support/data.js';

/** A job's status: a machine-readable `code` plus optional human `info`. */
export interface Status {
  readonly code: string;
  readonly info: string | null;
}

export function statusFromDict(data: JsonObject): Status {
  return Object.freeze({
    code: asString(data.code),
    info: nullableString(data.info),
  });
}

import {
  asObject,
  asString,
  nullableNumber,
  nullableString,
  type JsonObject,
} from '../support/data.js';

/** An error or warning attached to a job (the `errors[]` / `warnings[]` entries). */
export interface JobMessage {
  readonly code: number | null;
  readonly message: string;
  readonly source: string | null;
  readonly idSource: string | null;
  readonly details: JsonObject;
}

export function jobMessageFromDict(data: JsonObject): JobMessage {
  return Object.freeze({
    code: nullableNumber(data.code),
    message: asString(data.message),
    source: nullableString(data.source),
    idSource: nullableString(data.id_source),
    details: asObject(data.details),
  });
}

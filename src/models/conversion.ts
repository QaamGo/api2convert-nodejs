import { asObject, asString, nullableString, type JsonObject } from '../support/data.js';

/** A single conversion within a job: the target format plus its options. */
export interface Conversion {
  readonly target: string;
  readonly id: string | null;
  readonly category: string | null;
  readonly options: JsonObject;
  readonly metadata: JsonObject;
}

export function conversionFromDict(data: JsonObject): Conversion {
  return Object.freeze({
    target: asString(data.target),
    id: nullableString(data.id),
    category: nullableString(data.category),
    options: asObject(data.options),
    metadata: asObject(data.metadata),
  });
}

import { asObject, asString, nullableString, type JsonObject } from '../support/data.js';

/** A saved conversion preset (a reusable named set of target + options). */
export interface Preset {
  readonly id: string | null;
  readonly name: string;
  readonly target: string | null;
  readonly category: string | null;
  readonly scope: string | null;
  readonly options: JsonObject;
}

export function presetFromDict(data: JsonObject): Preset {
  return Object.freeze({
    id: nullableString(data.id),
    name: asString(data.name),
    target: nullableString(data.target),
    category: nullableString(data.category),
    scope: nullableString(data.scope),
    options: asObject(data.options),
  });
}

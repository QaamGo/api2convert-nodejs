import {
  asObject,
  asString,
  mapObjects,
  nullableString,
  type JsonObject,
} from '../support/data.js';
import { outputTargetFromDict, type OutputTarget } from './outputTarget.js';

/** A single conversion within a job: the target format plus its options. */
export interface Conversion {
  readonly target: string;
  readonly id: string | null;
  readonly category: string | null;
  readonly options: JsonObject;
  readonly metadata: JsonObject;
  /** Cloud delivery targets for this conversion's output, if any. */
  readonly outputTargets: readonly OutputTarget[];
}

export function conversionFromDict(data: JsonObject): Conversion {
  return Object.freeze({
    target: asString(data.target),
    id: nullableString(data.id),
    category: nullableString(data.category),
    options: asObject(data.options),
    metadata: asObject(data.metadata),
    outputTargets: Object.freeze(mapObjects(data.output_target, outputTargetFromDict)),
  });
}

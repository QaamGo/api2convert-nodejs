import {
  asObject,
  asString,
  nullableNumber,
  nullableString,
  type JsonObject,
} from '../support/data.js';

/** An input file attached to a job. */
export interface InputFile {
  readonly id: string | null;
  readonly type: string;
  readonly source: string | null;
  readonly status: string | null;
  readonly filename: string | null;
  readonly size: number | null;
  readonly contentType: string | null;
  readonly options: JsonObject;
  /**
   * Cloud-input locator keys (`bucket`, `file`, `host`, …); empty for non-cloud inputs.
   * Credentials are never surfaced on read.
   */
  readonly parameters: JsonObject;
}

export function inputFileFromDict(data: JsonObject): InputFile {
  return Object.freeze({
    id: nullableString(data.id),
    type: asString(data.type),
    source: nullableString(data.source),
    status: nullableString(data.status),
    filename: nullableString(data.filename),
    size: nullableNumber(data.size),
    contentType: nullableString(data.content_type),
    options: asObject(data.options),
    parameters: asObject(data.parameters),
  });
}

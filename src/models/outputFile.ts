import {
  asObject,
  asString,
  nullableNumber,
  nullableString,
  type JsonObject,
} from '../support/data.js';

/**
 * A produced output file.
 *
 * `uri` is a self-contained download URL (no auth), valid for a limited time
 * (24h by default).
 */
export interface OutputFile {
  readonly id: string | null;
  readonly uri: string;
  readonly filename: string | null;
  readonly size: number | null;
  readonly status: string | null;
  readonly contentType: string | null;
  readonly checksum: string | null;
  readonly metadata: JsonObject;
}

export function outputFileFromDict(data: JsonObject): OutputFile {
  return Object.freeze({
    id: nullableString(data.id),
    uri: asString(data.uri),
    filename: nullableString(data.filename),
    size: nullableNumber(data.size),
    status: nullableString(data.status),
    contentType: nullableString(data.content_type),
    checksum: nullableString(data.checksum),
    metadata: asObject(data.metadata),
  });
}

/** Construct an OutputFile from its essentials (mirrors the siblings' `OutputFile.of`). */
export function outputFileOf(id: string | null, uri: string, filename: string | null): OutputFile {
  return outputFileFromDict({ id, uri, filename });
}

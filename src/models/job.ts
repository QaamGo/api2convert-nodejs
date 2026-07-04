import {
  asObject,
  asString,
  mapObjects,
  nullableString,
  type JsonObject,
} from '../support/data.js';
import { JobStatus, isTerminalCode } from '../enums/jobStatus.js';
import { conversionFromDict, type Conversion } from './conversion.js';
import { inputFileFromDict, type InputFile } from './inputFile.js';
import { jobMessageFromDict, type JobMessage } from './jobMessage.js';
import { outputFileFromDict, type OutputFile } from './outputFile.js';
import { statusFromDict, type Status } from './status.js';

/**
 * A conversion job — the central API2Convert resource.
 *
 * `server` and `token` are needed to upload local files; `output` holds the
 * produced files once `isCompleted`. `raw` keeps the full decoded response for
 * fields not surfaced as typed properties.
 *
 * The `is*` flags are precomputed so the model stays a plain data object that
 * `JSON.stringify`s cleanly (parity with the siblings' status predicates).
 */
export interface Job {
  readonly id: string;
  readonly status: Status;
  readonly token: string | null;
  readonly server: string | null;
  readonly callback: string | null;
  readonly conversion: readonly Conversion[];
  readonly input: readonly InputFile[];
  readonly output: readonly OutputFile[];
  readonly errors: readonly JobMessage[];
  readonly warnings: readonly JobMessage[];
  readonly raw: JsonObject;
  /** The job finished successfully (`status.code === "completed"`). */
  readonly isCompleted: boolean;
  /** The job finished unsuccessfully (`status.code === "failed"`). */
  readonly isFailed: boolean;
  /** The job was canceled server-side — terminal, and produced no output. */
  readonly isCanceled: boolean;
  /** Finished (completed, failed or canceled) and will not change further. */
  readonly isTerminal: boolean;
}

export function jobFromDict(data: JsonObject): Job {
  const status = statusFromDict(asObject(data.status));
  return Object.freeze({
    id: asString(data.id),
    status,
    token: nullableString(data.token),
    server: nullableString(data.server),
    callback: nullableString(data.callback),
    conversion: Object.freeze(mapObjects(data.conversion, conversionFromDict)),
    input: Object.freeze(mapObjects(data.input, inputFileFromDict)),
    output: Object.freeze(mapObjects(data.output, outputFileFromDict)),
    errors: Object.freeze(mapObjects(data.errors, jobMessageFromDict)),
    warnings: Object.freeze(mapObjects(data.warnings, jobMessageFromDict)),
    // Shallow copy preserves the full response for forward-compat. Object spread
    // copies own enumerable properties via CreateDataProperty, so a payload key
    // named "__proto__" is copied as a plain own property and never mutates
    // Object.prototype (no prototype-pollution).
    raw: { ...data },
    isCompleted: (status.code as JobStatus) === JobStatus.Completed,
    isFailed: (status.code as JobStatus) === JobStatus.Failed,
    isCanceled: (status.code as JobStatus) === JobStatus.Canceled,
    isTerminal: isTerminalCode(status.code),
  });
}

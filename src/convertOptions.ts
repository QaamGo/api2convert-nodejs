/**
 * The "extra controls" for `convert` / `convertAsync`, and the accepted input types.
 *
 * These named controls are kept strictly separate from the open-ended conversion
 * `options` map, so open-ended API option keys can never collide with SDK control
 * keys (a fixed-contract requirement).
 */

import type { Readable } from 'node:stream';

import type { CloudInput } from './models/cloudInput.js';
import type { OutputTarget } from './models/outputTarget.js';

/**
 * A conversion source: a local file path, a public URL (`^https?://`), in-memory
 * bytes, a Node `Readable`, a web `ReadableStream`, or a {@link CloudInput} that
 * imports straight from customer storage. Streams are one-shot (not replayed on a
 * retry); a `CloudInput` — like a URL — is sent as a single started job.
 */
export type ConvertInput = string | Uint8Array | Blob | Readable | ReadableStream | CloudInput;

/** Extra controls for {@link Api2Convert.convert}. */
export interface ConvertOptions {
  /** Disambiguate an ambiguous target format. */
  category?: string;
  /** Override the poll timeout for this call, in seconds. */
  timeout?: number;
  /** Which output file the result selects (default 0). */
  outputIndex?: number;
  /** Advertised filename for an uploaded local file / stream. */
  filename?: string;
  /** Protects every output; remembered on the result and sent automatically on download. */
  downloadPassword?: string;
  /**
   * Cloud delivery targets attached to the conversion's `output_target` (never merged into the
   * options map). When set, the job delivers to your storage and produces no local output, so the
   * returned result is not downloaded.
   */
  outputTargets?: OutputTarget[];
}

/** Extra controls for {@link Api2Convert.convertAsync}. */
export interface AsyncOptions {
  /** Webhook URL to notify on status change (sets `notify_status: true`). */
  callback?: string;
  /** Disambiguate an ambiguous target format. */
  category?: string;
  /** Advertised filename for an uploaded local file / stream. */
  filename?: string;
  /** Sets the job's `download_passwords` (a later download must supply it). */
  downloadPassword?: string;
  /**
   * Cloud delivery targets attached to the conversion's `output_target` (never merged into the
   * options map).
   */
  outputTargets?: OutputTarget[];
}

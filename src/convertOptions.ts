/**
 * The "extra controls" for `convert` / `convertAsync`, and the accepted input types.
 *
 * These named controls are kept strictly separate from the open-ended conversion
 * `options` map, so open-ended API option keys can never collide with SDK control
 * keys (a fixed-contract requirement).
 */

import type { Readable } from 'node:stream';

/**
 * A conversion source: a local file path, a public URL (`^https?://`), in-memory
 * bytes, a Node `Readable`, or a web `ReadableStream`. Streams are one-shot (not
 * replayed on a retry).
 */
export type ConvertInput = string | Uint8Array | Blob | Readable | ReadableStream;

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
}

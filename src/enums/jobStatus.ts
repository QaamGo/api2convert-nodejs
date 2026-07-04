/**
 * Well-known job status codes (the `status.code` field).
 *
 * The API may introduce further codes; treat any code not listed here as
 * non-terminal. Use {@link isTerminalCode} for a raw status string rather than
 * comparing by hand.
 */
export enum JobStatus {
  Created = 'created',
  Incomplete = 'incomplete',
  Downloading = 'downloading',
  Queued = 'queued',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Canceled = 'canceled',
}

const TERMINAL_CODES: ReadonlySet<string> = new Set([
  JobStatus.Completed,
  JobStatus.Failed,
  JobStatus.Canceled,
]);

/** Is the given raw status code terminal? Unknown codes are non-terminal. */
export function isTerminalCode(code: string): boolean {
  return TERMINAL_CODES.has(code);
}

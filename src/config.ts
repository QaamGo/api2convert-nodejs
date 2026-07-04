/**
 * Immutable client configuration.
 *
 * Build via {@link createConfig}, which clamps every knob so a caller value can
 * neither busy-loop the poll (interval floor) nor poll unbounded (timeout ceiling).
 */

import type { HttpSender, Rng, Sleeper } from './transport/httpSender.js';

/** Default API base URL — includes the `/v2` path segment, no trailing slash. */
export const DEFAULT_BASE_URL = 'https://api.api2convert.com/v2';

/** Hard floor for the job-poll interval (seconds); prevents a busy-spin self-DDOS. */
export const MIN_POLL_INTERVAL = 0.5;

/** Hard ceiling for the total job-poll timeout (4 hours); bounds an unbounded poll. */
export const MAX_POLL_TIMEOUT = 14_400;

/** Options accepted by the {@link Api2Convert} constructor. */
export interface Api2ConvertOptions {
  /** API base URL (default `https://api.api2convert.com/v2`). */
  baseUrl?: string;
  /** Per-request network timeout (connect + read), in seconds (default 30, min 1). */
  timeout?: number;
  /** Automatic retries for transient failures (429 / 5xx / network) (default 2, min 0). */
  maxRetries?: number;
  /** First poll interval when waiting for a job, in seconds (default 1, floored to 0.5). */
  pollInterval?: number;
  /** Upper bound the poll interval backs off to, in seconds (default 5). */
  pollMaxInterval?: number;
  /** How long to wait for a job before giving up, in seconds (default 300, capped 14400). */
  pollTimeout?: number;
  /** Bring your own HTTP transport (defaults to a global-`fetch` sender). */
  httpSender?: HttpSender;
  /** Injectable delay function (used by retry/poll; handy in tests). */
  sleeper?: Sleeper;
  /** Injectable [0,1) random source for backoff jitter (handy in tests). */
  rng?: Rng;
}

/** Frozen, clamped client configuration value object. */
export interface Config {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly pollInterval: number;
  readonly pollMaxInterval: number;
  readonly pollTimeout: number;
}

function intOr(value: number | undefined, fallback: number): number {
  return Math.trunc(value ?? fallback);
}

/**
 * Build a {@link Config}, clamping every knob. This is the single entry point the
 * client uses, so a caller value can never busy-loop or poll unbounded.
 */
export function createConfig(apiKey: string, options: Api2ConvertOptions = {}): Config {
  const pollInterval = Math.max(MIN_POLL_INTERVAL, options.pollInterval ?? 1.0);
  const pollMaxInterval = Math.max(pollInterval, options.pollMaxInterval ?? 5.0);
  const pollTimeout = Math.min(MAX_POLL_TIMEOUT, Math.max(0, intOr(options.pollTimeout, 300)));
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');

  return Object.freeze({
    apiKey,
    baseUrl,
    timeout: Math.max(1, intOr(options.timeout, 30)),
    maxRetries: Math.max(0, intOr(options.maxRetries, 2)),
    pollInterval,
    pollMaxInterval,
    pollTimeout,
  });
}

/**
 * The pluggable HTTP transport seam.
 *
 * The {@link Transport} builds an {@link HttpRequest} and hands it to an
 * {@link HttpSender}; the default sender ({@link FetchHttpSender}) runs it over
 * the global `fetch`. Tests inject a fake sender to assert on requests and return
 * canned responses. Mirrors the Java `HttpSender` / Python `httpx.Client`
 * injection / PHP PSR-18 seam.
 */

/** The `fetch` init object type (undici's `RequestInit`, derived from the global `fetch`). */
export type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

/** A body value accepted by the underlying `fetch` (opaque to the transport). */
export type FetchBody = NonNullable<FetchInit['body']>;

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Materialized body for replayable requests (e.g. a JSON string). */
  body?: string | Uint8Array;
  /**
   * A fresh body producer for streamed / multipart requests, rebuilt per attempt
   * so a replay re-creates it. Takes precedence over {@link HttpRequest.body}.
   */
  makeBody?: () => FetchBody;
  /**
   * Whether this request may follow HTTP redirects. Only a no-secret download
   * opts in; any request carrying an `X-Oc-*` secret header must stay `false` so
   * a redirect can't forward the secret to another host.
   */
  followRedirects: boolean;
  /** Whether the body can be re-sent on a retry (false for one-shot streams). */
  replayable: boolean;
  /** Per-request network timeout, in milliseconds. */
  timeoutMs: number;
}

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  /** Case-insensitive response header lookup; `null` when absent. */
  header(name: string): string | null;
  /** Read the full body as bytes (single-use). */
  bytes(): Promise<Uint8Array>;
  /** Iterate the body in chunks (single-use); used for streaming downloads. */
  stream(): AsyncIterable<Uint8Array>;
  /** Discard an unconsumed body to free the connection (used between retries). */
  discard(): Promise<void>;
}

export interface HttpSender {
  send(request: HttpRequest): Promise<HttpResponse>;
}

/** Sleep for the given number of seconds (injectable; real impl uses `setTimeout`). */
export type Sleeper = (seconds: number) => Promise<void>;

/** A [0, 1) random source for backoff jitter (injectable for deterministic tests). */
export type Rng = () => number;

/** The default real sleeper. */
export const defaultSleeper: Sleeper = (seconds) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, seconds) * 1000));

/**
 * The HTTP layer: authenticated requests, transient-failure retries with
 * exponential backoff, error-response mapping to typed exceptions, and JSON
 * decoding.
 *
 * Resources talk to the API through {@link Transport.request}; the uploader and
 * the downloader use {@link Transport.send} / {@link Transport.interpret} /
 * {@link Transport.openDownload} directly because they need non-JSON bodies and
 * per-request auth. Internal.
 */

import type { Config } from '../config.js';
import {
  ApiError,
  Api2ConvertError,
  AuthenticationError,
  NetworkError,
  NotFoundError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '../errors.js';
import { isObject, type JsonObject } from '../support/data.js';
import { VERSION } from '../version.js';
import {
  defaultSleeper,
  type HttpRequest,
  type HttpResponse,
  type HttpSender,
  type Rng,
  type Sleeper,
} from './httpSender.js';

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'HEAD',
  'PUT',
  'DELETE',
  'OPTIONS',
  'TRACE',
]);
const MAX_BACKOFF_SECONDS = 8.0;
/** Upper bound for an honored `Retry-After` so a hostile value can't stall for hours. */
const MAX_RETRY_AFTER_SECONDS = 120.0;

const USER_AGENT = `api2convert-nodejs/${VERSION} node/${process.versions.node}`;
const DECODER = new TextDecoder();

export class Transport {
  private readonly sender: HttpSender;
  private readonly _config: Config;
  private readonly sleep: Sleeper;
  private readonly rand: Rng;

  constructor(sender: HttpSender, config: Config, sleeper?: Sleeper, rng?: Rng) {
    this.sender = sender;
    this._config = config;
    this.sleep = sleeper ?? defaultSleeper;
    this.rand = rng ?? Math.random;
  }

  get config(): Config {
    return this._config;
  }

  close(): Promise<void> {
    // The global-fetch sender has no client to close; kept for API parity.
    return Promise.resolve();
  }

  /** Sleep for (at least) `seconds` with a small upward jitter (job polling). */
  async pause(seconds: number): Promise<void> {
    await this.sleep(this.jitter(seconds));
  }

  /** Perform an authenticated JSON request and return the decoded body. */
  async request(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
    headers?: Record<string, string>,
  ): Promise<unknown> {
    const requestHeaders: Record<string, string> = { 'X-Api2convert-Api-Key': this._config.apiKey };
    Object.assign(requestHeaders, headers ?? {});
    let content: string | undefined;
    if (body !== undefined && body !== null) {
      content = JSON.stringify(body);
      requestHeaders['Content-Type'] = 'application/json';
    }
    const request: HttpRequest = {
      method,
      url: this.url(path, query),
      headers: requestHeaders,
      ...(content !== undefined ? { body: content } : {}),
      followRedirects: false,
      replayable: true,
      timeoutMs: this._config.timeout * 1000,
    };
    return this.interpret(await this.send(request));
  }

  /**
   * Send a request with retry/backoff. Adds the common `Accept` / `User-Agent`
   * headers but no auth (callers add the header they need). A non-idempotent
   * request is not replayed on a network error (the backend may have acted, so a
   * blind retry could create a duplicate job); a non-replayable body is sent once.
   */
  async send(request: HttpRequest): Promise<HttpResponse> {
    request.headers.Accept = 'application/json';
    request.headers['User-Agent'] = USER_AGENT;
    const idempotent = this.isIdempotent(request);
    let attempt = 0;

    for (;;) {
      let response: HttpResponse;
      try {
        response = await this.sender.send(request);
      } catch (exc) {
        // Already-typed failures (e.g. a malformed URL) are terminal — never retried.
        if (exc instanceof Api2ConvertError) throw exc;
        if (request.replayable && idempotent && attempt < this._config.maxRetries) {
          await this.backoff(attempt);
          attempt += 1;
          continue;
        }
        throw new NetworkError(`Request to API2Convert failed: ${describeError(exc)}`, {
          cause: exc,
        });
      }

      const status = response.status;
      const mayRetry =
        RETRYABLE_STATUSES.has(status) &&
        request.replayable &&
        attempt < this._config.maxRetries &&
        (status === 429 || idempotent);
      if (mayRetry) {
        await response.discard();
        await this.backoff(attempt, response.header('Retry-After'));
        attempt += 1;
        continue;
      }

      return response;
    }
  }

  /** Raise a typed exception for error responses; otherwise decode JSON. */
  async interpret(response: HttpResponse): Promise<unknown> {
    await this.ensureSuccessful(response);

    // Every API request rides the no-follow path (secrets travel in X-Api2convert-* headers), so a 3xx
    // passes ensureSuccessful (status < 400) but was deliberately not followed; decoding its body
    // would yield an empty model. Surface it as a typed error instead (mirrors the download guard).
    if (response.status >= 300 && response.status < 400) {
      throw new NetworkError(
        `API2Convert returned an unexpected redirect (HTTP ${response.status}); the request was not followed.`,
      );
    }

    const raw = await response.bytes();
    if (raw.length === 0) return {};
    let decoded: unknown;
    try {
      decoded = JSON.parse(DECODER.decode(raw));
    } catch (exc) {
      throw new NetworkError(
        `API2Convert returned a non-JSON success response: ${describeError(exc)}`,
        { cause: exc },
      );
    }
    return isObject(decoded) || Array.isArray(decoded) ? decoded : {};
  }

  /** Raise the appropriate typed exception when `response` is an HTTP error. */
  async ensureSuccessful(response: HttpResponse): Promise<void> {
    const status = response.status;
    if (status < 400) return;

    const body = await this.decodeSafe(response);
    const apiMessage = body.message;
    const message =
      typeof apiMessage === 'string' ? apiMessage : response.statusText || 'Request failed';
    const requestId = response.header('X-Request-Id');
    const options = { statusCode: status, requestId, body };

    if (status === 401 || status === 403) throw new AuthenticationError(message, options);
    if (status === 402) throw new PaymentRequiredError(message, options);
    if (status === 404) throw new NotFoundError(message, options);
    if (status === 429) {
      throw new RateLimitError(message, {
        ...options,
        retryAfter: this.parseRetryAfter(response.header('Retry-After') ?? ''),
      });
    }
    if (status === 400 || status === 422) throw new ValidationError(message, options);
    if (status >= 500) throw new ServerError(message, options);
    throw new ApiError(message, options);
  }

  /**
   * Open a (self-contained) download URL and return the response for streaming.
   *
   * A request carrying any `X-Api2convert-*` secret header (e.g. a download password) must
   * not follow redirects; a plain, passwordless download may follow storage/CDN
   * redirects. When a secret-bearing request is redirected, `redirect: 'manual'`
   * yields an opaque response (`status 0`) — surfaced as a {@link NetworkError}
   * so a silently-empty file never lands on disk.
   */
  async openDownload(uri: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
    const carriesSecret = Object.keys(headers).some((h) =>
      h.toLowerCase().startsWith('x-api2convert-'),
    );
    const request: HttpRequest = {
      method: 'GET',
      url: uri,
      headers: { ...headers },
      followRedirects: !carriesSecret,
      replayable: true,
      timeoutMs: this._config.timeout * 1000,
    };
    const response = await this.send(request);
    await this.ensureSuccessful(response);
    if (response.status === 0) {
      throw new NetworkError(
        'The download did not resolve: a redirect was not followed because the request ' +
          'carried a secret header.',
      );
    }
    return response;
  }

  private url(path: string, query?: Record<string, string>): string {
    let url = this._config.baseUrl + '/' + path.replace(/^\/+/, '');
    if (query && Object.keys(query).length > 0) {
      url += '?' + new URLSearchParams(query).toString();
    }
    return url;
  }

  private async decodeSafe(response: HttpResponse): Promise<JsonObject> {
    try {
      const raw = await response.bytes();
      if (raw.length === 0) return {};
      const decoded: unknown = JSON.parse(DECODER.decode(raw));
      return isObject(decoded) ? decoded : {};
    } catch {
      return {};
    }
  }

  private async backoff(attempt: number, retryAfter?: string | null): Promise<void> {
    const retry = this.parseRetryAfter(retryAfter ?? '');
    let seconds: number;
    if (retry !== null && retry > 0) {
      // Honor a positive Retry-After (capped so a hostile value can't stall us
      // for hours). Not jittered: the server asked for this exact delay.
      seconds = Math.min(MAX_RETRY_AFTER_SECONDS, retry);
    } else {
      // A zero/past/absent Retry-After falls through to jittered exponential
      // backoff so we never retry-storm with no delay.
      seconds = this.jitter(Math.min(MAX_BACKOFF_SECONDS, 0.5 * 2 ** attempt));
    }
    await this.sleep(seconds);
  }

  /** Parse `Retry-After` (delay-seconds or HTTP-date) into whole seconds; never negative. */
  private parseRetryAfter(value: string): number | null {
    if (!value) return null;
    const asSeconds = Number(value);
    if (Number.isFinite(asSeconds)) return Math.max(0, Math.trunc(asSeconds));
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return Math.max(0, Math.round((asDate - Date.now()) / 1000));
    return null;
  }

  /** Add a small upward jitter (0-25%) so correlated clients don't lockstep. */
  private jitter(seconds: number): number {
    return seconds + seconds * 0.25 * this.rand();
  }

  private isIdempotent(request: HttpRequest): boolean {
    if (IDEMPOTENT_METHODS.has(request.method.toUpperCase())) return true;
    return Object.entries(request.headers).some(
      ([name, value]) => name.toLowerCase() === 'idempotency-key' && value !== '',
    );
  }
}

function describeError(exc: unknown): string {
  if (exc instanceof Error) return exc.message;
  return String(exc);
}

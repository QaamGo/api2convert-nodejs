/**
 * The typed exception hierarchy.
 *
 * Every failure raised by the SDK descends from {@link Api2ConvertError}. HTTP
 * error responses (status >= 400) map to {@link ApiError} and its subclasses;
 * transport failures, conversion failures, poll timeouts and webhook
 * verification failures descend directly from the base.
 *
 * The class names use the JS/Python `...Error` convention; they map 1:1 to the
 * PHP/Java SDKs' `...Exception` classes.
 */

import type { Job, JobMessage } from './models/index.js';

/**
 * Base class for every exception raised by the SDK.
 *
 * Catch this to handle any SDK failure in one place; catch a more specific
 * subclass to react to a particular failure mode. Secrets (API key, upload
 * token, download password) are never placed in any message.
 */
export class Api2ConvertError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    // Make `instanceof` reliable even after transpilation / across the ESM+CJS
    // boundary, and give every subclass a meaningful `.name`.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}

export interface ApiErrorOptions {
  statusCode?: number;
  requestId?: string | null;
  body?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * An HTTP error response (status >= 400). Used directly for a 4xx with no more
 * specific subclass; specific statuses map to the dedicated subclasses below.
 */
export class ApiError extends Api2ConvertError {
  /** The HTTP status code of the error response. */
  readonly statusCode: number;
  /** Value of the `X-Request-Id` response header, if any. Quote it in support requests. */
  readonly requestId: string | null;
  /** The decoded JSON error body, or `{}` when absent/unparseable. */
  readonly body: Record<string, unknown>;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.statusCode = options.statusCode ?? 0;
    this.requestId = options.requestId ?? null;
    this.body = options.body ?? {};
  }
}

/** The API key is missing, invalid or not permitted (HTTP 401 / 403). */
export class AuthenticationError extends ApiError {}

/** The account has no remaining quota/credit (HTTP 402). */
export class PaymentRequiredError extends ApiError {}

/** The requested resource does not exist (HTTP 404). */
export class NotFoundError extends ApiError {}

/** The request was rejected as invalid, e.g. an unknown target (HTTP 400 / 422). */
export class ValidationError extends ApiError {}

/** Too many requests (HTTP 429), raised only once auto-retries are exhausted. */
export class RateLimitError extends ApiError {
  /** Seconds to wait before retrying, parsed from the `Retry-After` header (raw, uncapped). */
  readonly retryAfter: number | null;

  constructor(message: string, options: ApiErrorOptions & { retryAfter?: number | null } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter ?? null;
  }
}

/** A server-side error (HTTP >= 500), raised once auto-retries are exhausted. */
export class ServerError extends ApiError {}

/**
 * A request did not yield a usable response.
 *
 * Raised for a transport-level failure (DNS/connection/TLS/read) once idempotent
 * retries are exhausted, for a 2xx response whose body is not valid JSON, or for
 * a malformed API-supplied URL.
 */
export class NetworkError extends Api2ConvertError {}

/**
 * A job reached the `failed` (or `canceled`) status.
 *
 * The originating {@link Job} is attached so you can inspect its errors and warnings.
 */
export class ConversionFailedError extends Api2ConvertError {
  readonly job: Job;

  constructor(job: Job, message?: string) {
    super(message ?? ConversionFailedError.buildMessage(job));
    this.job = job;
  }

  /** The failed job's errors (may be empty if the API gave no detail). */
  errors(): readonly JobMessage[] {
    return this.job.errors;
  }

  private static buildMessage(job: Job): string {
    const first = job.errors[0];
    if (first !== undefined) {
      const code = first.code !== null ? ` (code ${String(first.code)})` : '';
      return `Conversion failed: ${first.message}${code}`;
    }
    const info = job.status.info;
    return info !== null ? `Conversion failed: ${info}` : 'Conversion failed.';
  }
}

/**
 * A job did not reach a terminal status within the configured poll timeout.
 *
 * The job is still running server-side — re-fetch it later with
 * `client.jobs().get(job.id)`. (Maps to the PHP/Java SDKs' `TimeoutException`;
 * named to avoid confusion with an operation timeout.)
 */
export class ConversionTimeoutError extends Api2ConvertError {
  readonly job: Job;

  constructor(job: Job, timeoutSeconds: number) {
    super(
      `Timed out after ${String(timeoutSeconds)}s waiting for job ${job.id} to finish ` +
        `(last status: ${job.status.code}).`,
    );
    this.job = job;
  }
}

/**
 * A webhook payload could not be verified against the provided signature/secret.
 *
 * Treat this as a security event: do not trust or process the payload.
 */
export class SignatureVerificationError extends Api2ConvertError {}

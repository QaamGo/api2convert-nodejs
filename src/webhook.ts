/**
 * Webhook callback verification and parsing.
 *
 * Pass the **raw** request body (bytes or the exact string received) so signature
 * verification is byte-exact. Verification uses HMAC-SHA256 and matches the
 * server's signed-webhooks scheme; until signed webhooks are enabled on your
 * account no signature is sent — use {@link WebhookVerifier.parse} then, or call
 * {@link WebhookVerifier.constructEvent} with an empty secret to skip verification.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { SignatureVerificationError } from './errors.js';
import { jobFromDict, type Job } from './models/job.js';
import { isObject, type JsonObject } from './support/data.js';

/** A verified webhook callback. The API posts the job whose status changed. */
export interface WebhookEvent {
  /** The job whose status changed. */
  readonly job: Job;
  /** The full decoded callback body. */
  readonly payload: JsonObject;
}

export class WebhookVerifier {
  /**
   * Verify the signature (when a secret is given) and return the typed event.
   *
   * `payload` must be the raw request body. `signature` is the value of the
   * signature header (`X-Oc-Signature`). Pass an empty `secret` to skip
   * verification. Raises {@link SignatureVerificationError} when the signature is
   * missing or does not match (constant-time comparison).
   */
  constructEvent(
    payload: string | Uint8Array,
    signature: string | null | undefined,
    secret: string,
  ): WebhookEvent {
    if (secret !== '') {
      if (signature === null || signature === undefined || signature === '') {
        throw new SignatureVerificationError('Missing webhook signature header.');
      }
      const expected = createHmac('sha256', secret).update(toBytes(payload)).digest('hex');
      const expectedBuf = Buffer.from(expected, 'ascii');
      const actualBuf = Buffer.from(signature, 'utf8');
      // Length-guard first: timingSafeEqual throws on unequal-length inputs. Only
      // compare (constant-time) when the lengths match.
      if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
        throw new SignatureVerificationError('Webhook signature verification failed.');
      }
    }
    return this.parse(payload);
  }

  /**
   * Parse a callback body into a typed event WITHOUT verifying a signature.
   *
   * Only use this when signed webhooks are not yet enabled for your account.
   */
  parse(payload: string | Uint8Array): WebhookEvent {
    let decoded: unknown;
    try {
      decoded = JSON.parse(
        typeof payload === 'string' ? payload : new TextDecoder().decode(payload),
      );
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new SignatureVerificationError(`Webhook payload is not valid JSON: ${detail}`, {
        cause,
      });
    }
    if (!isObject(decoded)) {
      throw new SignatureVerificationError('Webhook payload is not a JSON object.');
    }
    return { job: jobFromDict(decoded), payload: decoded };
  }
}

function toBytes(payload: string | Uint8Array): Buffer {
  return typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
}

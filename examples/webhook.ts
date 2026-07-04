/**
 * Verify and parse an API2Convert webhook callback. Framework-agnostic: hand it the
 * RAW request body and the `X-Oc-Signature` header value.
 */

import { Api2Convert, SignatureVerificationError, type WebhookEvent } from '../src/index.js';

const WEBHOOK_SECRET = process.env.API2CONVERT_WEBHOOK_SECRET ?? '';

export function handleWebhook(
  rawBody: string | Buffer,
  signature: string | null,
): WebhookEvent | null {
  try {
    const event = Api2Convert.webhooks().constructEvent(rawBody, signature, WEBHOOK_SECRET);
    // React to the job whose status changed.
    console.log(`job ${event.job.id} is now ${event.job.status.code}`);
    return event;
  } catch (err) {
    if (err instanceof SignatureVerificationError) {
      // In an HTTP handler: respond 400 and do NOT trust the payload.
      console.error('rejected webhook: signature verification failed');
      return null;
    }
    throw err;
  }
}

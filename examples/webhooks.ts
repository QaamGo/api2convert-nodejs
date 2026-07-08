/**
 * Webhooks — start an async conversion with a callback URL, and verify the
 * callback the API later POSTs back to you.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/webhooks.ts
 */

import { Api2Convert, SignatureVerificationError, type WebhookEvent } from '../src/index.js';

const DOCX = 'https://example-files.online-convert.com/document/docx/example.docx';
const CALLBACK = 'https://your-app.example.com/api2convert/webhook';
const WEBHOOK_SECRET = process.env.API2CONVERT_WEBHOOK_SECRET ?? '';

// --- Sending side: start a job and ask the API to notify your endpoint. -------
async function startJob(): Promise<void> {
  const client = new Api2Convert();
  try {
    // convertAsync returns immediately with a STARTED job; the API will POST to
    // CALLBACK whenever the job's status changes. Do not block waiting for it.
    const job = await client.convertAsync(DOCX, 'pdf', null, {
      category: 'document',
      callback: CALLBACK,
    });
    console.log(`started job ${job.id}; the API will POST to ${CALLBACK} on status change`);
  } finally {
    await client.close();
  }
}

// --- Receiving side: verify and parse the callback in your HTTP handler. ------
// Framework-agnostic: hand it the RAW request body and the `X-Oc-Signature` header.
export function handleWebhook(
  rawBody: string | Buffer,
  signature: string | null,
): WebhookEvent | null {
  try {
    const event = Api2Convert.webhooks().constructEvent(rawBody, signature, WEBHOOK_SECRET);
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

void startJob();

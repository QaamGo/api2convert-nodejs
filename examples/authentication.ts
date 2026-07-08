/**
 * Authentication — verify your API key by listing your jobs.
 * The key is read from API2CONVERT_API_KEY and is never printed.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/authentication.ts
 */

import { Api2Convert, AuthenticationError } from '../src/index.js';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    // A successful list proves the key authenticated.
    const jobs = await client.jobs().list();
    console.log(`authenticated; ${String(jobs.length)} recent job(s)`);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      // The SDK never puts the credential into the error message.
      console.error(`authentication failed (HTTP ${String(err.statusCode)})`);
      return;
    }
    throw err;
  } finally {
    await client.close();
  }
}

void main();

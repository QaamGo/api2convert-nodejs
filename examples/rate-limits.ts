/**
 * Rate limits — read your account's contract/quota information.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/rate-limits.ts
 */

import { Api2Convert } from '../src/index.js';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    // Contracts describe the plan, quotas and limits your key is subject to.
    const contracts = await client.contracts().get();
    console.log(JSON.stringify(contracts, null, 2));
  } finally {
    await client.close();
  }
}

void main();

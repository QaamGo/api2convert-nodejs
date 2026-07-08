/**
 * Statistics — read your API usage for a given month.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/statistics.ts
 */

import { Api2Convert } from '../src/index.js';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    // Month format is yyyy-mm; "all" scopes across every API key on the account.
    const stats = await client.stats().month('2026-06');
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await client.close();
  }
}

void main();

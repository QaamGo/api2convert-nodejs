/**
 * Create hashes — compute the SHA-256 checksum of a file.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/create-hashes.ts
 */

import { Api2Convert } from '../src/index.js';

const ZIP = 'https://example-files.online-convert.com/archive/zip/example.zip';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    // "sha256" is a hash-category target; the output holds the computed digest.
    const result = await client.convert(ZIP, 'sha256', null, { category: 'hash' });
    const digest = await result.contents();
    console.log(`sha256: ${digest.toString('utf8').trim()}`);
    const path = await result.save('out/');
    console.log(`saved ${path} (job ${result.job.id})`);
  } finally {
    await client.close();
  }
}

void main();

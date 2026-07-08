/**
 * Extract assets — pull the embedded assets (images, etc.) out of a DOCX.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/extract-assets.ts
 */

import { Api2Convert } from '../src/index.js';

const DOCX = 'https://example-files.online-convert.com/document/docx/example.docx';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    const result = await client.convert(DOCX, 'extract-assets', null, { category: 'operation' });
    const outputs = result.outputs();
    console.log(`job ${result.job.id}: ${String(outputs.length)} extracted asset(s)`);
    for (const out of outputs) console.log(`  ${out.uri}`);
  } finally {
    await client.close();
  }
}

void main();

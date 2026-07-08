/**
 * File analysis — read a file's metadata as JSON.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/file-analysis.ts
 */

import { Api2Convert } from '../src/index.js';

const JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example.jpg';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    // "json" is a metadata-category target; the output is a JSON report.
    const result = await client.convert(JPG, 'json', null, { category: 'metadata' });
    const report = await result.contents();
    console.log(report.toString('utf8'));
  } finally {
    await client.close();
  }
}

void main();

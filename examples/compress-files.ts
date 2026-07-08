/**
 * Compress files — shrink a JPG with the "compress" operation.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/compress-files.ts
 */

import { Api2Convert } from '../src/index.js';

const JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example.jpg';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    const result = await client.convert(
      JPG,
      'compress',
      { compression_level: 'high' },
      { category: 'operation' },
    );
    const path = await result.save('out/');
    console.log(`saved ${path} (job ${result.job.id})`);
  } finally {
    await client.close();
  }
}

void main();

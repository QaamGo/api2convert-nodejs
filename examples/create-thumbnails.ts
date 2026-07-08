/**
 * Create thumbnails — render the first page of a PDF to a PNG thumbnail.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/create-thumbnails.ts
 */

import { Api2Convert } from '../src/index.js';

const PDF = 'https://example-files.online-convert.com/document/pdf/example.pdf';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    // "thumbnail" is an operation-category target; its options control the render.
    const result = await client.convert(
      PDF,
      'thumbnail',
      { thumbnail_target: 'png', width: 300, pages: 'first', dpi: 150 },
      { category: 'operation' },
    );
    const path = await result.save('out/');
    console.log(`saved ${path} (job ${result.job.id})`);
  } finally {
    await client.close();
  }
}

void main();

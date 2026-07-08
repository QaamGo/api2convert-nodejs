/**
 * Image operations — resize an image to fit 800x600, cropping to keep aspect ratio.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/image-operations.ts
 */

import { Api2Convert } from '../src/index.js';

const JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example.jpg';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    const result = await client.convert(
      JPG,
      'resize-image',
      { width: 800, height: 600, resize_by: 'px', resize_handling: 'keep_aspect_ratio_crop' },
      { category: 'operation' },
    );
    const path = await result.save('out/');
    console.log(`saved ${path} (job ${result.job.id})`);
  } finally {
    await client.close();
  }
}

void main();

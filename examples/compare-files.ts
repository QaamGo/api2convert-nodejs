/**
 * Compare files — diff two images with SSIM and produce a visual diff.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/compare-files.ts
 */

import { Api2Convert } from '../src/index.js';

const JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example.jpg';
const JPG_SMALL = 'https://example-files.online-convert.com/raster%20image/jpg/example_small.jpg';

async function main(): Promise<void> {
  const client = new Api2Convert();
  const jobs = client.jobs();
  try {
    const job = await jobs.create({
      process: true,
      input: [
        { type: 'remote', source: JPG_SMALL },
        { type: 'remote', source: JPG },
      ],
      conversion: [
        {
          category: 'operation',
          target: 'compare-image',
          options: { method: 'ssim', threshold: 5, diff_color: 'red' },
        },
      ],
    });

    const done = await jobs.wait(job.id);
    const outputs = await jobs.outputs(done.id);
    console.log(`job ${done.id} is ${done.status.code}, ${String(outputs.length)} output(s)`);
  } finally {
    await client.close();
  }
}

void main();

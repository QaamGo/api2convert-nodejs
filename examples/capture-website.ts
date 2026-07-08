/**
 * Capture a website — screenshot a URL to PNG.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/capture-website.ts
 */

import { Api2Convert } from '../src/index.js';

async function main(): Promise<void> {
  const client = new Api2Convert();
  const jobs = client.jobs();
  try {
    // The input uses the "screenshot" engine to render a live page, which is
    // then delivered as a PNG.
    const job = await jobs.create({
      process: true,
      input: [
        {
          type: 'remote',
          source: 'https://www.online-convert.com',
          engine: 'screenshot',
          options: { screen_width: 1280, screen_height: 1024, device_scale_factor: 1 },
        },
      ],
      conversion: [{ category: 'image', target: 'png' }],
    });

    const done = await jobs.wait(job.id);
    const output = done.output[0];
    if (!output) throw new Error('the job produced no output');
    const path = await client.download(output).save('out/');
    console.log(`saved ${path} (job ${done.id})`);
  } finally {
    await client.close();
  }
}

void main();

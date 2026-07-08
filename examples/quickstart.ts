/**
 * Quickstart — convert a remote JPG to PNG, fetch the job, then download the output.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/quickstart.ts
 */

import { Api2Convert } from '../src/index.js';

const JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example.jpg';

async function main(): Promise<void> {
  // Reads API2CONVERT_API_KEY from the environment when no key is passed.
  const client = new Api2Convert();
  try {
    // 1. Convert a remote file and wait for the result.
    const result = await client.convert(JPG, 'png');

    // 2. Fetch the finished job by id.
    const job = await client.jobs().get(result.job.id);
    console.log(`job ${job.id} is ${job.status.code}`);

    // 3. Download the produced output file.
    const output = job.output[0];
    if (!output) throw new Error('the job produced no output');
    const path = await client.download(output).save('out/');
    console.log(`saved ${path}`);
  } finally {
    await client.close();
  }
}

void main();

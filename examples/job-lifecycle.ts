/**
 * Job lifecycle — drive create -> add input -> start -> wait -> outputs by hand.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/job-lifecycle.ts
 */

import { Api2Convert } from '../src/index.js';

const JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example.jpg';

async function main(): Promise<void> {
  const client = new Api2Convert();
  const jobs = client.jobs();
  try {
    // Stage a job (process: false) so we can attach inputs before starting.
    const staged = await jobs.create({
      process: false,
      conversion: [{ category: 'image', target: 'png' }],
    });
    console.log(`created job ${staged.id}`);

    // Attach a remote input, then start processing.
    await jobs.addInput(staged.id, { type: 'remote', source: JPG });
    await jobs.start(staged.id);

    // Poll to a terminal status, then inspect the outputs.
    const done = await jobs.wait(staged.id);
    const outputs = await jobs.outputs(done.id);
    console.log(`job ${done.id} is ${done.status.code}, ${String(outputs.length)} output(s)`);
    for (const out of outputs) console.log(`  ${out.uri}`);
  } finally {
    await client.close();
  }
}

void main();

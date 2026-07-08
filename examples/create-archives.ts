/**
 * Create archives — bundle a PDF and a PNG into a single ZIP.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/create-archives.ts
 */

import { Api2Convert } from '../src/index.js';

const PDF = 'https://example-files.online-convert.com/document/pdf/example.pdf';
const PNG = 'https://example-files.online-convert.com/raster%20image/png/example.png';

async function main(): Promise<void> {
  const client = new Api2Convert();
  const jobs = client.jobs();
  try {
    const job = await jobs.create({
      process: true,
      input: [
        { type: 'remote', source: PDF },
        { type: 'remote', source: PNG },
      ],
      conversion: [{ category: 'archive', target: 'zip' }],
    });

    const done = await jobs.wait(job.id);
    const outputs = await jobs.outputs(done.id);
    console.log(`job ${done.id} is ${done.status.code}, ${String(outputs.length)} output(s)`);
    for (const out of outputs) console.log(`  ${out.uri}`);
  } finally {
    await client.close();
  }
}

void main();

/**
 * Add a watermark — stamp a PNG image onto a PDF (a two-input job).
 * Run: API2CONVERT_API_KEY=... npx tsx examples/add-watermark.ts
 */

import { Api2Convert } from '../src/index.js';

const PDF = 'https://example-files.online-convert.com/document/pdf/example.pdf';
const PNG = 'https://example-files.online-convert.com/raster%20image/png/example.png';

async function main(): Promise<void> {
  const client = new Api2Convert();
  const jobs = client.jobs();
  try {
    // Two inputs: the PDF to stamp, plus the PNG used as the stamp.
    const job = await jobs.create({
      process: true,
      input: [
        { type: 'remote', source: PDF },
        { type: 'remote', source: PNG },
      ],
      conversion: [
        { category: 'document', target: 'pdf', options: { stamp: true, alignment: 'center' } },
      ],
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

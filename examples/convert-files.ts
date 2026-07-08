/**
 * Convert files — browse the conversions catalog, then convert a JPG to PNG.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/convert-files.ts
 */

import { Api2Convert } from '../src/index.js';

const JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example.jpg';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    // The whole catalog: every supported source/target/options combination.
    const all = await client.conversions().list();
    console.log(`catalog: ${String(all.length)} conversions`);

    // Narrow it to the conversions that produce PNG (source: our JPG).
    const toPng = await client.conversions().list(undefined, 'png');
    console.log(`${String(toPng.length)} conversions target png`);

    // Now run one of them.
    const result = await client.convert(JPG, 'png');
    const path = await result.save('out/');
    console.log(`saved ${path} (job ${result.job.id})`);
  } finally {
    await client.close();
  }
}

void main();

/**
 * Uploading files — upload a LOCAL file and convert it in one call.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/uploading-files.ts
 */

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Api2Convert } from '../src/index.js';

// A minimal valid 1x1 PNG, so the example is fully self-contained.
const ONE_PX_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    // Write a local file to disk, then hand its path to convert(): the SDK
    // stages the job, streams the file to the per-job upload server, and starts it.
    const dir = await mkdtemp(join(tmpdir(), 'a2c-upload-'));
    const src = join(dir, 'pixel.png');
    await writeFile(src, ONE_PX_PNG);

    const result = await client.convert(src, 'png');
    const path = await result.save('out/');
    console.log(`uploaded ${src} -> saved ${path} (job ${result.job.id})`);
  } finally {
    await client.close();
  }
}

void main();

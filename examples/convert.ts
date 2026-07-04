/**
 * Convert a file with one call. Run with a real key:
 *   API2CONVERT_API_KEY=... npx tsx examples/convert.ts
 */

import { Api2Convert, ValidationError } from '../src/index.js';

async function main(): Promise<void> {
  // Reads API2CONVERT_API_KEY from the environment when no key is passed.
  const client = new Api2Convert();

  try {
    // From a URL, with options; save into a directory (keeps the server filename).
    const result = await client.convert(
      'https://example-files.online-convert.com/raster%20image/jpg/example_small.jpg',
      'png',
      { width: 320 },
    );
    const path = await result.save('out/');
    console.log(`saved ${path} (job ${result.job.id})`);
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error(`invalid request: ${err.message}`);
      return;
    }
    throw err;
  } finally {
    await client.close();
  }
}

void main();

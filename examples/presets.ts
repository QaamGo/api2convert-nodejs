/**
 * Presets — list your saved conversion presets for a category/target.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/presets.ts
 */

import { Api2Convert } from '../src/index.js';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    const presets = await client.presets().list('video', 'mp4');
    console.log(`${String(presets.length)} preset(s) for video -> mp4`);
    for (const preset of presets) console.log(`  ${preset.id ?? '(new)'} ${preset.name}`);
  } finally {
    await client.close();
  }
}

void main();

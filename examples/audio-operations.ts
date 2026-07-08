/**
 * Audio operations — transcode a WAV to AAC with explicit codec settings.
 * Run: API2CONVERT_API_KEY=... npx tsx examples/audio-operations.ts
 */

import { Api2Convert } from '../src/index.js';

const WAV = 'https://example-files.online-convert.com/audio/wav/example.wav';

async function main(): Promise<void> {
  const client = new Api2Convert();
  try {
    const result = await client.convert(
      WAV,
      'aac',
      { audio_codec: 'aac', audio_bitrate: 192, channels: 'stereo', frequency: 44100 },
      { category: 'audio' },
    );
    const path = await result.save('out/');
    console.log(`saved ${path} (job ${result.job.id})`);
  } finally {
    await client.close();
  }
}

void main();

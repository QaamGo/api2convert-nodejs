/**
 * Live conformance against the real API. Skipped unless `API2CONVERT_API_KEY` is
 * set (mirrors the Java `@EnabledIfEnvironmentVariable` / Python `tests/live`).
 *
 * The key is supplied at runtime and NEVER committed. For CI/dev the behat
 * `default` key is used, e.g.:
 *   API2CONVERT_API_KEY=<behat-default-key> npm run test:live
 *
 * `API2CONVERT_BASE_URL` overrides the endpoint (default: production).
 * NOTE: production runs consume real quota — run deliberately, not in the default loop.
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Api2Convert, ValidationError } from '../../src/index.js';

const KEY = process.env.API2CONVERT_API_KEY;
const BASE_URL = process.env.API2CONVERT_BASE_URL;
const REMOTE_JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example_small.jpg';

describe.skipIf(!KEY)('live conformance', () => {
  let client: Api2Convert;
  let dir: string;

  beforeAll(async () => {
    client = new Api2Convert(KEY, BASE_URL !== undefined ? { baseUrl: BASE_URL } : {});
    dir = await mkdtemp(join(tmpdir(), 'a2c-live-'));
  });
  afterAll(async () => {
    await client.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('converts a remote JPG to PNG and writes non-empty bytes', async () => {
    const result = await client.convert(REMOTE_JPG, 'png');
    expect(result.job.isCompleted).toBe(true);
    const path = await result.save(dir);
    expect((await stat(path)).size).toBeGreaterThan(0);
  }, 120_000);

  it('rejects an unknown target with a ValidationError', async () => {
    await expect(client.convert(REMOTE_JPG, 'this-is-not-a-real-target')).rejects.toBeInstanceOf(
      ValidationError,
    );
  }, 120_000);
});

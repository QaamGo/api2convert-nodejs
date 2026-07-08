/**
 * Live conformance suite — the canonical, cross-SDK set of scenarios that
 * exercises the real API2Convert API end to end. Every scenario mirrors one of
 * the 20 documented example programs in `examples/` (same operation, plus an
 * assertion), so this file doubles as an executable, verified tour of the SDK.
 *
 * Because these hit the real API and consume quota, the whole suite auto-skips
 * unless `API2CONVERT_API_KEY` is set (via `describe.skipIf`):
 *
 *   API2CONVERT_API_KEY=<key> npm run test:live
 *
 * `API2CONVERT_BASE_URL` overrides the host (e.g. a beta environment). Never
 * commit a real key — it is read only from the environment.
 *
 * The 20 positive scenarios map 1:1 to the documented example set; the two
 * trailing negative scenarios (unknown target -> validation error; bad key ->
 * authentication error that never leaks the key) round out the shared contract.
 */

import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Api2ConvertOptions } from '../../src/index.js';
import {
  Api2Convert,
  AuthenticationError,
  ConversionFailedError,
  ValidationError,
} from '../../src/index.js';

// --- Remote fixtures (public example-files.online-convert.com) ---------------
const PDF = 'https://example-files.online-convert.com/document/pdf/example.pdf';
const PNG = 'https://example-files.online-convert.com/raster%20image/png/example.png';
const JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example.jpg';
const JPG_SMALL = 'https://example-files.online-convert.com/raster%20image/jpg/example_small.jpg';
const WAV = 'https://example-files.online-convert.com/audio/wav/example.wav';
const DOCX = 'https://example-files.online-convert.com/document/docx/example.docx';
const ZIP = 'https://example-files.online-convert.com/archive/zip/example.zip';

/**
 * A minimal valid 1x1 PNG, written to disk to exercise the real multipart
 * upload handshake (remote-URL inputs skip upload entirely).
 */
const ONE_PX_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const KEY = process.env.API2CONVERT_API_KEY;
const BASE_URL = process.env.API2CONVERT_BASE_URL;

/**
 * The idiomatic client options: honor `API2CONVERT_BASE_URL` so the same suite
 * can target prod or a beta host, and omit `baseUrl` entirely otherwise
 * (`exactOptionalPropertyTypes` forbids passing `undefined`).
 */
function clientOptions(): Api2ConvertOptions {
  return BASE_URL !== undefined ? { baseUrl: BASE_URL } : {};
}

// Each live call hits the real conversion pipeline, so give it room well beyond
// the offline suite's default timeout.
const LIVE_TIMEOUT = 180_000;

describe.skipIf(!KEY)('live examples', () => {
  let client: Api2Convert;
  let dir: string;

  beforeAll(async () => {
    // `new Api2Convert(key)` also falls back to API2CONVERT_API_KEY when empty;
    // we pass it explicitly to keep this suite self-documenting.
    client = new Api2Convert(KEY, clientOptions());
    dir = await mkdtemp(join(tmpdir(), 'a2c-live-'));
  });

  afterAll(async () => {
    await client.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  // 1. quickstart -----------------------------------------------------------
  it(
    'quickstart: converts a remote JPG to PNG, fetches the job, downloads output',
    async () => {
      const result = await client.convert(JPG, 'png');
      expect(result.job.isCompleted).toBe(true);

      const job = await client.jobs().get(result.job.id);
      const output = job.output[0];
      expect(output).toBeDefined();

      const path = await client.download(output!).save(dir);
      expect((await stat(path)).size).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 2. convert-files --------------------------------------------------------
  it(
    'convert-files: lists the catalog, filters to png, then converts',
    async () => {
      const all = await client.conversions().list();
      expect(all.length).toBeGreaterThan(0);

      const toPng = await client.conversions().list(undefined, 'png');
      expect(toPng.length).toBeGreaterThan(0);

      const result = await client.convert(JPG, 'png');
      expect(result.job.isCompleted).toBe(true);
      const bytes = await result.contents();
      expect(bytes.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 3. uploading-files ------------------------------------------------------
  it(
    'uploading-files: uploads a local file and converts it to PNG',
    async () => {
      const src = join(dir, 'pixel.png');
      await writeFile(src, ONE_PX_PNG);

      const result = await client.convert(src, 'png');
      expect(result.job.isCompleted).toBe(true);
      const bytes = await result.contents();
      expect(bytes.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 4. job-lifecycle --------------------------------------------------------
  it(
    'job-lifecycle: create -> add input -> start -> wait -> outputs',
    async () => {
      const jobs = client.jobs();
      const staged = await jobs.create({
        process: false,
        conversion: [{ category: 'image', target: 'png' }],
      });
      expect(staged.id).not.toBe('');

      await jobs.addInput(staged.id, { type: 'remote', source: JPG });
      await jobs.start(staged.id);

      const done = await jobs.wait(staged.id);
      expect(done.isCompleted).toBe(true);
      const outputs = await jobs.outputs(done.id);
      expect(outputs.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 5. add-watermark --------------------------------------------------------
  it(
    'add-watermark: stamps a PNG onto a PDF (two remote inputs)',
    async () => {
      const jobs = client.jobs();
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
      expect(done.isCompleted).toBe(true);
      const outputs = await jobs.outputs(done.id);
      expect(outputs.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 6. create-thumbnails ----------------------------------------------------
  it(
    'create-thumbnails: renders the first PDF page to a PNG thumbnail',
    async () => {
      const result = await client.convert(
        PDF,
        'thumbnail',
        { thumbnail_target: 'png', width: 300, pages: 'first', dpi: 150 },
        { category: 'operation' },
      );
      expect(result.job.isCompleted).toBe(true);
      const bytes = await result.contents();
      expect(bytes.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 7. compress-files -------------------------------------------------------
  it(
    'compress-files: compresses a JPG with the compress operation',
    async () => {
      const result = await client.convert(
        JPG,
        'compress',
        { compression_level: 'high' },
        { category: 'operation' },
      );
      expect(result.job.isCompleted).toBe(true);
      const bytes = await result.contents();
      expect(bytes.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 8. create-archives ------------------------------------------------------
  it(
    'create-archives: bundles a PDF and a PNG into a ZIP',
    async () => {
      const jobs = client.jobs();
      const job = await jobs.create({
        process: true,
        input: [
          { type: 'remote', source: PDF },
          { type: 'remote', source: PNG },
        ],
        conversion: [{ category: 'archive', target: 'zip' }],
      });

      const done = await jobs.wait(job.id);
      expect(done.isCompleted).toBe(true);
      const outputs = await jobs.outputs(done.id);
      expect(outputs.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 9. create-hashes --------------------------------------------------------
  it(
    'create-hashes: computes the SHA-256 of a file',
    async () => {
      const result = await client.convert(ZIP, 'sha256', null, { category: 'hash' });
      expect(result.job.isCompleted).toBe(true);
      const digest = await result.contents();
      expect(digest.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 10. extract-assets ------------------------------------------------------
  it(
    'extract-assets: extracts embedded assets from a DOCX',
    async () => {
      const result = await client.convert(DOCX, 'extract-assets', null, { category: 'operation' });
      expect(result.job.isCompleted).toBe(true);
      expect(result.outputs().length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 11. file-analysis -------------------------------------------------------
  it(
    'file-analysis: reads file metadata as JSON',
    async () => {
      const result = await client.convert(JPG, 'json', null, { category: 'metadata' });
      expect(result.job.isCompleted).toBe(true);
      const report = await result.contents();
      expect(report.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 12. compare-files -------------------------------------------------------
  it(
    'compare-files: diffs two images with SSIM',
    async () => {
      const jobs = client.jobs();
      const job = await jobs.create({
        process: true,
        input: [
          { type: 'remote', source: JPG_SMALL },
          { type: 'remote', source: JPG },
        ],
        conversion: [
          {
            category: 'operation',
            target: 'compare-image',
            options: { method: 'ssim', threshold: 5, diff_color: 'red' },
          },
        ],
      });

      const done = await jobs.wait(job.id);
      expect(done.isCompleted).toBe(true);
    },
    LIVE_TIMEOUT,
  );

  // 13. capture-website -----------------------------------------------------
  it(
    'capture-website: screenshots a URL to PNG',
    async () => {
      const jobs = client.jobs();
      const job = await jobs.create({
        process: true,
        input: [
          {
            type: 'remote',
            source: 'https://www.online-convert.com',
            engine: 'screenshot',
            options: { screen_width: 1280, screen_height: 1024, device_scale_factor: 1 },
          },
        ],
        conversion: [{ category: 'image', target: 'png' }],
      });

      const done = await jobs.wait(job.id);
      expect(done.isCompleted).toBe(true);
      const outputs = await jobs.outputs(done.id);
      expect(outputs.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 14. audio-operations ----------------------------------------------------
  it(
    'audio-operations: transcodes a WAV to AAC',
    async () => {
      const result = await client.convert(
        WAV,
        'aac',
        { audio_codec: 'aac', audio_bitrate: 192, channels: 'stereo', frequency: 44100 },
        { category: 'audio' },
      );
      expect(result.job.isCompleted).toBe(true);
      const bytes = await result.contents();
      expect(bytes.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 15. image-operations ----------------------------------------------------
  it(
    'image-operations: resizes an image to 800x600 (crop, keep aspect)',
    async () => {
      const result = await client.convert(
        JPG,
        'resize-image',
        { width: 800, height: 600, resize_by: 'px', resize_handling: 'keep_aspect_ratio_crop' },
        { category: 'operation' },
      );
      expect(result.job.isCompleted).toBe(true);
      const bytes = await result.contents();
      expect(bytes.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 16. webhooks ------------------------------------------------------------
  it(
    'webhooks: starts an async job with a callback URL',
    async () => {
      // A webhook receipt is not testable in CI: assert only that convertAsync
      // returns a STARTED job with an id (do NOT wait for the callback).
      const job = await client.convertAsync(DOCX, 'pdf', null, {
        category: 'document',
        callback: 'https://your-app.example.com/api2convert/webhook',
      });
      expect(job.id).not.toBe('');
    },
    LIVE_TIMEOUT,
  );

  // 17. presets -------------------------------------------------------------
  it(
    'presets: lists saved presets for video -> mp4',
    async () => {
      const presets = await client.presets().list('video', 'mp4');
      // May be empty for a fresh account; assert the call returns a list.
      expect(Array.isArray(presets)).toBe(true);
    },
    LIVE_TIMEOUT,
  );

  // 18. statistics ----------------------------------------------------------
  it(
    'statistics: reads usage for a recent month',
    async () => {
      await expect(client.stats().month('2026-06')).resolves.toBeDefined();
    },
    LIVE_TIMEOUT,
  );

  // 19. rate-limits ---------------------------------------------------------
  it(
    'rate-limits: reads the account contracts',
    async () => {
      await expect(client.contracts().get()).resolves.toBeDefined();
    },
    LIVE_TIMEOUT,
  );

  // 20. authentication ------------------------------------------------------
  it(
    'authentication: lists jobs with a valid key',
    async () => {
      const jobs = await client.jobs().list();
      expect(Array.isArray(jobs)).toBe(true);
    },
    LIVE_TIMEOUT,
  );

  // --- Negative scenarios (kept from the shared contract) ------------------

  // Validation: the API rejects an unknown target — either synchronously at
  // create time (validation) or as a failed job. Both are typed errors.
  it(
    'rejects an unknown target with a typed error',
    async () => {
      const err = await client.convert(JPG, 'this-is-not-a-real-target').then(
        () => {
          throw new Error('unknown target should fail');
        },
        (e: unknown) => e,
      );
      expect(err instanceof ValidationError || err instanceof ConversionFailedError).toBe(true);
    },
    LIVE_TIMEOUT,
  );

  // Authentication: a bad key produces a typed `AuthenticationError` carrying
  // the HTTP status, and the SDK never puts the credential into the error.
  it(
    'surfaces a typed authentication error without leaking the key',
    async () => {
      const BOGUS_KEY = 'a2c-invalid-key-for-testing';
      const bogus = new Api2Convert(BOGUS_KEY, clientOptions());
      try {
        const err = await bogus
          .jobs()
          .list()
          .then(
            () => {
              throw new Error('a bad key must not authenticate');
            },
            (e: unknown) => e,
          );

        expect(err).toBeInstanceOf(AuthenticationError);
        const apiError = err as AuthenticationError;
        expect([401, 403]).toContain(apiError.statusCode);
        expect(apiError.message).not.toContain(BOGUS_KEY);
        expect(String(apiError)).not.toContain(BOGUS_KEY);
      } finally {
        await bogus.close();
      }
    },
    LIVE_TIMEOUT,
  );
});

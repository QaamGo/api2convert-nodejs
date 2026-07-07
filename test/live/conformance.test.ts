/**
 * Live conformance suite — the canonical, cross-SDK set of scenarios that
 * exercises the real API2Convert API end to end. Every scenario is written to
 * read like a usage example, so this file doubles as an executable tour of the
 * SDK: build a client, convert, discover, drive the job lifecycle, and handle
 * the typed errors.
 *
 * Because these hit the real API and consume quota, the whole suite auto-skips
 * unless `API2CONVERT_API_KEY` is set (via `describe.skipIf`):
 *
 *   API2CONVERT_API_KEY=<key> npm run test:live
 *
 * `API2CONVERT_BASE_URL` overrides the host (e.g. a beta environment). Never
 * commit a real key — it is read only from the environment.
 *
 * The seven scenarios mirror the shared spec implemented by every api2convert
 * SDK (php, python, java, go, nodejs, dotnet, ruby, rust):
 *
 *   1. convert a remote URL              — the one-call happy path
 *   2. upload and convert a local file   — the multipart upload path
 *   3. convert with options              — apply target-specific options
 *   4. discover the conversion catalog   — list conversions and option schemas
 *   5. drive the job lifecycle by hand   — create → input → start → wait → inspect
 *   6. handle a validation error         — an unknown target is a typed error
 *   7. handle an authentication error    — a bad key is typed and never leaked
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

/** A small, stable public image used as a remote input everywhere below. */
const REMOTE_JPG = 'https://example-files.online-convert.com/raster%20image/jpg/example_small.jpg';

/**
 * A minimal valid 1×1 PNG, written to disk to exercise the real multipart
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
const LIVE_TIMEOUT = 120_000;

describe.skipIf(!KEY)('live conformance', () => {
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

  // 1. One-call convert of a remote URL -------------------------------------
  //
  // The simplest usage: hand `convert` a URL and a target format. The SDK
  // creates a server-side-fetch job, polls it to completion, and hands back a
  // result you can save straight to disk.
  it(
    'converts a remote URL to PNG',
    async () => {
      const result = await client.convert(REMOTE_JPG, 'png');
      expect(result.job.isCompleted).toBe(true);

      const path = await result.save(dir);
      expect((await stat(path)).size).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 2. Upload and convert a local file --------------------------------------
  //
  // For a local path (or bytes / a stream), the SDK stages the job, streams the
  // file to the per-job upload server (authenticated with the job's upload
  // token, never your account key), starts it, polls, and downloads.
  it(
    'uploads a local file and converts it to JPEG',
    async () => {
      const src = join(dir, 'pixel.png');
      await writeFile(src, ONE_PX_PNG);

      const result = await client.convert(src, 'jpg');
      expect(result.job.isCompleted).toBe(true);

      const bytes = await result.contents();
      expect(bytes.length).toBeGreaterThan(0);
      // A JPEG starts with the SOI marker 0xFF 0xD8.
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
    },
    LIVE_TIMEOUT,
  );

  // 3. Apply conversion options ---------------------------------------------
  //
  // Target-specific options go in the third argument, kept strictly separate
  // from the SDK's own controls so an option key can never collide with an SDK
  // argument. Discover the valid keys for a target with `client.options` (see
  // the next scenario); here we re-encode at a lower JPEG quality.
  it(
    'converts with target-specific options',
    async () => {
      const result = await client.convert(REMOTE_JPG, 'jpg', {
        quality: 50,
        // Add e.g. width: 64, height: 64 to resize.
      });
      expect(result.job.isCompleted).toBe(true);

      const bytes = await result.contents();
      expect(bytes.length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 4. Discover the conversion catalog --------------------------------------
  //
  // `conversions().list` and `options` describe what the API can do — which
  // targets exist and which options each accepts. Neither consumes conversion
  // quota, so they are cheap to call before building a request.
  it(
    'discovers the conversion catalog',
    async () => {
      // Which conversions target `jpg`?
      const conversions = await client.conversions().list(undefined, 'jpg');
      expect(conversions.length).toBeGreaterThan(0);

      // The option schema for a target (type / enum / default / range per option).
      await expect(client.options('png', 'image')).resolves.toBeDefined();
    },
    LIVE_TIMEOUT,
  );

  // 5. Drive the full job lifecycle by hand ---------------------------------
  //
  // `convert` is built from these primitives. Driving them yourself unlocks
  // compound/merge jobs, custom inputs, and step-by-step inspection: create a
  // staged job, attach an input, start it, wait for completion, then inspect
  // the job's status and output metadata.
  it(
    'drives the job lifecycle by hand and inspects the outputs',
    async () => {
      const jobs = client.jobs();

      // Stage a job (process: false) so we can attach inputs before starting.
      const staged = await jobs.create({ process: false, conversion: [{ target: 'png' }] });
      expect(staged.id).not.toBe('');

      // Attach a remote input, then start processing.
      await jobs.addInput(staged.id, { type: 'remote', source: REMOTE_JPG });
      await jobs.start(staged.id);

      // Poll to a terminal status.
      const finished = await jobs.wait(staged.id);
      expect(finished.isCompleted).toBe(true);

      // Inspect the outputs — both from the finished job and via the outputs API.
      expect(finished.output.length).toBeGreaterThan(0);
      const outputs = await jobs.outputs(staged.id);
      expect(outputs.length).toBe(finished.output.length);

      const [first] = finished.output;
      expect(first).toBeDefined();
      expect((first?.uri ?? '').length).toBeGreaterThan(0);
    },
    LIVE_TIMEOUT,
  );

  // 6. Validation error on an unknown target --------------------------------
  //
  // The API rejects an unknown target — either synchronously at create time
  // (validation) or as a failed job. Both are typed errors you can catch on.
  it(
    'rejects an unknown target with a typed error',
    async () => {
      const err = await client.convert(REMOTE_JPG, 'this-is-not-a-real-target').then(
        () => {
          throw new Error('unknown target should fail');
        },
        (e: unknown) => e,
      );
      expect(err instanceof ValidationError || err instanceof ConversionFailedError).toBe(true);
    },
    LIVE_TIMEOUT,
  );

  // 7. Authentication error, with no secret leak ----------------------------
  //
  // A bad key produces a typed `AuthenticationError` carrying the HTTP status.
  // Crucially, the SDK never puts a credential into an error message — we assert
  // the bogus key does not appear in the rendered error.
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
        // The rendered error must never leak the credential.
        expect(apiError.message).not.toContain(BOGUS_KEY);
        expect(String(apiError)).not.toContain(BOGUS_KEY);
      } finally {
        await bogus.close();
      }
    },
    LIVE_TIMEOUT,
  );
});

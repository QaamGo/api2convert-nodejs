import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeClient } from '../helpers/testClient.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'a2c-convert-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('convert() from a URL', () => {
  it('creates a single started job with a remote input, polls, and downloads', async () => {
    const { client, http } = makeClient();
    http
      .addJson(200, { id: 'job-1', status: { code: 'processing' } })
      .addJson(200, {
        id: 'job-1',
        status: { code: 'completed' },
        output: [{ id: 'out-1', uri: 'https://dl.example.com/x.png', filename: 'result.png' }],
      })
      .addRaw(200, enc('PNGDATA'));

    const result = await client.convert('https://example.com/in.jpg', 'png');

    // create
    expect(http.at(0).method).toBe('POST');
    expect(http.at(0).url).toMatch(/\/jobs$/);
    expect(http.at(0).header('X-Api2convert-Api-Key')).toBe('test-key');
    expect(http.at(0).followRedirects).toBe(false);
    expect(http.at(0).json()).toEqual({
      conversion: [{ target: 'png' }],
      process: true,
      input: [{ type: 'remote', source: 'https://example.com/in.jpg' }],
    });
    // poll
    expect(http.at(1).method).toBe('GET');
    expect(http.at(1).url).toMatch(/\/jobs\/job-1$/);

    expect(result.job.isCompleted).toBe(true);
    expect(result.url()).toBe('https://dl.example.com/x.png');

    // download to a directory keeps the API filename
    const path = await result.save(dir);
    expect(path).toBe(join(dir, 'result.png'));
    expect((await readFile(path)).toString()).toBe('PNGDATA');

    const dl = http.at(2);
    expect(dl.method).toBe('GET');
    expect(dl.url).toBe('https://dl.example.com/x.png');
    expect(dl.followRedirects).toBe(true); // no secret -> may follow storage redirects
    expect(dl.header('X-Api2convert-Api-Key')).toBeNull(); // never send the account key on a download
    expect(dl.header('X-Api2convert-Download-Password')).toBeNull();
  });

  it('passes conversion options through 1:1 and returns bytes via contents()', async () => {
    const { client, http } = makeClient();
    http
      .addJson(200, { id: 'j', status: { code: 'processing' } })
      .addJson(200, { id: 'j', status: { code: 'completed' }, output: [{ uri: 'https://dl/x' }] })
      .addRaw(200, enc('BYTES'));

    const result = await client.convert('https://x/in.jpg', 'jpg', { quality: 85, width: 1280 });

    expect(http.at(0).json()).toEqual({
      conversion: [{ target: 'jpg', options: { quality: 85, width: 1280 } }],
      process: true,
      input: [{ type: 'remote', source: 'https://x/in.jpg' }],
    });
    expect((await result.contents()).toString()).toBe('BYTES');
  });
});

describe('convert() from a local file / stream', () => {
  function stageQueue(client: ReturnType<typeof makeClient>): void {
    client.http
      .addJson(200, {
        id: 'job-2',
        token: 'tok-abc',
        server: 'https://up.example.com/v2',
        status: { code: 'incomplete' },
      })
      .addJson(200, { id: 'in-1', type: 'upload' })
      .addJson(200, { id: 'job-2', status: { code: 'processing' } })
      .addJson(200, {
        id: 'job-2',
        status: { code: 'completed' },
        output: [{ uri: 'https://dl/x.pdf', filename: 'x.pdf' }],
      });
  }

  it('stages -> uploads with the per-job token -> starts -> polls', async () => {
    const ctx = makeClient();
    stageQueue(ctx);
    const file = join(dir, 'in.txt');
    await writeFile(file, 'hello');

    const result = await ctx.client.convert(file, 'pdf');

    expect(ctx.http.at(0).method).toBe('POST');
    expect(ctx.http.at(0).json()).toMatchObject({
      conversion: [{ target: 'pdf' }],
      process: false,
    });

    const upload = ctx.http.at(1);
    expect(upload.method).toBe('POST');
    expect(upload.url).toBe('https://up.example.com/v2/upload-file/job-2');
    expect(upload.header('X-Api2convert-Token')).toBe('tok-abc');
    expect(upload.header('X-Api2convert-Api-Key')).toBeNull(); // account key never reaches the upload server
    expect(upload.followRedirects).toBe(false);
    expect(upload.hasStreamingBody).toBe(true);
    expect(upload.replayable).toBe(true); // a path re-opens a fresh stream per attempt

    expect(ctx.http.at(2).method).toBe('PATCH');
    expect(ctx.http.at(2).json()).toEqual({ process: true });
    expect(ctx.http.at(3).url).toMatch(/\/jobs\/job-2$/);
    expect(result.job.isCompleted).toBe(true);
  });

  it('uploads a one-shot Readable stream (not replayable)', async () => {
    const ctx = makeClient();
    stageQueue(ctx);
    await ctx.client.convert(Readable.from([Buffer.from('streamed')]), 'pdf');
    expect(ctx.http.at(1).header('X-Api2convert-Token')).toBe('tok-abc');
    expect(ctx.http.at(1).replayable).toBe(false);
  });

  it('uploads in-memory bytes (replayable)', async () => {
    const ctx = makeClient();
    stageQueue(ctx);
    await ctx.client.convert(Buffer.from('bytes'), 'pdf');
    expect(ctx.http.at(1).replayable).toBe(true);
    expect(ctx.http.at(1).hasStreamingBody).toBe(true);
  });
});

describe('download password transparency', () => {
  function queue(client: ReturnType<typeof makeClient>): void {
    client.http
      .addJson(200, { id: 'j', status: { code: 'processing' } })
      .addJson(200, { id: 'j', status: { code: 'completed' }, output: [{ uri: 'https://dl/x' }] })
      .addRaw(200, enc('SECRETDATA'));
  }

  it('sets download_passwords on create and applies it automatically on download', async () => {
    const ctx = makeClient();
    queue(ctx);
    const result = await ctx.client.convert('https://x/in.jpg', 'png', null, {
      downloadPassword: 'hunter2',
    });
    expect(ctx.http.at(0).json()).toMatchObject({ download_passwords: ['hunter2'] });

    await result.contents();
    const dl = ctx.http.last();
    expect(dl.header('X-Api2convert-Download-Password')).toBe('hunter2');
    expect(dl.followRedirects).toBe(false); // carries a secret -> no redirects
  });

  it('lets an explicit password argument override the remembered one', async () => {
    const ctx = makeClient();
    queue(ctx);
    const result = await ctx.client.convert('https://x/in.jpg', 'png', null, {
      downloadPassword: 'remembered',
    });
    await result.contents('override');
    expect(ctx.http.last().header('X-Api2convert-Download-Password')).toBe('override');
  });

  it('sends no password field or header when none is given', async () => {
    const ctx = makeClient();
    queue(ctx);
    const result = await ctx.client.convert('https://x/in.jpg', 'png');
    expect(ctx.http.at(0).json()).not.toHaveProperty('download_passwords');
    await result.contents();
    expect(ctx.http.last().header('X-Api2convert-Download-Password')).toBeNull();
  });
});

describe('convertAsync() and options()', () => {
  it('starts without polling and sets the callback + notify_status', async () => {
    const { client, http } = makeClient();
    http.addJson(200, { id: 'job-9', status: { code: 'processing' } });

    const job = await client.convertAsync('https://x/in.jpg', 'png', null, {
      callback: 'https://app.example/webhook',
    });

    expect(http.requests.length).toBe(1);
    expect(http.at(0).json()).toMatchObject({
      callback: 'https://app.example/webhook',
      notify_status: true,
      process: true,
    });
    expect(job.id).toBe('job-9');
  });

  it('discovers options for a target without a category filter', async () => {
    const { client, http } = makeClient();
    http.addJson(200, [{ target: 'jpg', options: { quality: { type: 'int' } } }]);
    const opts = await client.options('jpg');
    expect(http.at(0).url).toContain('target=jpg');
    expect(http.at(0).url).not.toContain('category=');
    expect(opts).toEqual({ quality: { type: 'int' } });
  });
});

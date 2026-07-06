import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Api2ConvertError, outputFileFromDict } from '../../src/index.js';
import { makeClient } from '../helpers/testClient.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'a2c-dl-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FileDownload.save', () => {
  it('uses the API filename when the target is a directory', async () => {
    const { client, http } = makeClient();
    http.addRaw(200, enc('DATA'));
    const output = outputFileFromDict({ uri: 'https://dl/x', filename: 'result.pdf' });
    const path = await client.download(output).save(dir);
    expect(path).toBe(join(dir, 'result.pdf'));
    expect((await readFile(path)).toString()).toBe('DATA');
  });

  it('reduces a traversal filename to a basename that cannot escape the directory', async () => {
    const { client, http } = makeClient();
    http.addRaw(200, enc('X'));
    const output = outputFileFromDict({ uri: 'https://dl/x', filename: '../../evil.txt' });
    const path = await client.download(output).save(dir);
    expect(path).toBe(join(dir, 'evil.txt'));
    // the escaped path was never created
    await expect(access(join(dir, '..', '..', 'evil.txt'))).rejects.toThrow();
  });

  it('falls back to "output" when the filename and id are unusable', async () => {
    const { client, http } = makeClient();
    http.addRaw(200, enc('X'));
    const output = outputFileFromDict({ uri: 'https://dl/x', filename: '..', id: null });
    const path = await client.download(output).save(dir);
    expect(path).toBe(join(dir, 'output'));
  });

  it('uses an explicit file path verbatim', async () => {
    const { client, http } = makeClient();
    http.addRaw(200, enc('DATA'));
    const output = outputFileFromDict({ uri: 'https://dl/x', filename: 'ignored.pdf' });
    const target = join(dir, 'custom.bin');
    const path = await client.download(output).save(target);
    expect(path).toBe(target);
    expect((await readFile(path)).toString()).toBe('DATA');
  });

  it('leaves no partial file behind when the download fails mid-stream', async () => {
    const { client, http } = makeClient();
    http.addStreamError(enc('PARTIAL-BYTES'));
    const output = outputFileFromDict({ uri: 'https://dl/x', filename: 'result.pdf' });
    const target = join(dir, 'result.pdf');
    await expect(client.download(output).save(target)).rejects.toBeInstanceOf(Api2ConvertError);
    // the truncated file was removed, not left masquerading as a complete download
    await expect(access(target)).rejects.toThrow();
  });

  it('raises (and makes no download request) when the directory cannot be created', async () => {
    const { client, http } = makeClient();
    const blocker = join(dir, 'file');
    await writeFile(blocker, 'x');
    const output = outputFileFromDict({ uri: 'https://dl/x', filename: 'out.bin' });
    await expect(
      client.download(output).save(join(blocker, 'sub', 'out.bin')),
    ).rejects.toBeInstanceOf(Api2ConvertError);
    expect(http.requests.length).toBe(0);
  });
});

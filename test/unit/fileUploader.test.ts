import { describe, expect, it } from 'vitest';

import { Api2ConvertError, jobFromDict } from '../../src/index.js';
import { makeClient } from '../helpers/testClient.js';

describe('FileUploader guards', () => {
  it('fails fast (no network call) when the job has no upload server/token', async () => {
    const { client, http } = makeClient();
    const job = jobFromDict({ id: 'j', status: { code: 'created' } }); // process:true style, no server/token
    await expect(client.jobs().upload(job, Buffer.from('x'))).rejects.toBeInstanceOf(
      Api2ConvertError,
    );
    expect(http.requests.length).toBe(0);
  });

  it('fails (no network call) when the local file does not exist', async () => {
    const { client, http } = makeClient();
    const job = jobFromDict({
      id: 'job-2',
      token: 'tok',
      server: 'https://up.example.com/v2',
      status: { code: 'incomplete' },
    });
    await expect(client.jobs().upload(job, '/no/such/file.bin')).rejects.toThrow(
      /Input file not found/,
    );
    expect(http.requests.length).toBe(0);
  });

  it('authenticates with the per-job token, never the account key', async () => {
    const { client, http } = makeClient();
    http.addJson(200, { id: 'in-1', type: 'upload' });
    const job = jobFromDict({
      id: 'job-2',
      token: 'tok-abc',
      server: 'https://up.example.com/v2',
      status: { code: 'incomplete' },
    });

    const input = await client.jobs().upload(job, Buffer.from('hello'));

    expect(input.type).toBe('upload');
    const req = http.last();
    expect(req.url).toBe('https://up.example.com/v2/upload-file/job-2');
    expect(req.header('X-Api2convert-Token')).toBe('tok-abc');
    expect(req.header('X-Api2convert-Api-Key')).toBeNull();
    expect(req.followRedirects).toBe(false);
  });
});

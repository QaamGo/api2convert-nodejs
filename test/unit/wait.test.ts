import { describe, expect, it } from 'vitest';

import { ConversionFailedError, ConversionTimeoutError } from '../../src/index.js';
import { makeClient } from '../helpers/testClient.js';

describe('JobsResource.wait', () => {
  it('polls until the job reaches a terminal status', async () => {
    const { client, http, slept } = makeClient();
    http
      .addJson(200, { id: 'j', status: { code: 'incomplete' } })
      .addJson(200, { id: 'j', status: { code: 'processing' } })
      .addJson(200, { id: 'j', status: { code: 'completed' } });

    const job = await client.jobs().wait('j');

    expect(job.isCompleted).toBe(true);
    expect(http.requests.length).toBe(3);
    expect(slept.length).toBe(2); // paused between the three polls
  });

  it('throws ConversionFailedError carrying the job and its typed errors', async () => {
    const { client, http } = makeClient();
    http.addJson(200, {
      id: 'j',
      status: { code: 'failed' },
      errors: [{ code: 4000, message: 'unsupported input' }],
    });

    const err = (await client
      .jobs()
      .wait('j')
      .catch((e: unknown) => e)) as ConversionFailedError;
    expect(err).toBeInstanceOf(ConversionFailedError);
    expect(err.job.id).toBe('j');
    expect(err.errors()[0]?.code).toBe(4000);
    expect(err.message).toContain('unsupported input');
  });

  it('returns the failed job when throwOnFailure is false', async () => {
    const { client, http } = makeClient();
    http.addJson(200, { id: 'j', status: { code: 'failed' } });
    const job = await client.jobs().wait('j', undefined, false);
    expect(job.isFailed).toBe(true);
  });

  it('throws ConversionTimeoutError once the deadline elapses', async () => {
    const { client, http } = makeClient({ pollTimeout: 0 });
    http.addJson(200, { id: 'j', status: { code: 'processing' } });
    const err = await client
      .jobs()
      .wait('j')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConversionTimeoutError);
  });

  it('treats a canceled job as a failure', async () => {
    const { client, http } = makeClient();
    http.addJson(200, { id: 'j', status: { code: 'canceled' } });
    const err = await client
      .jobs()
      .wait('j')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConversionFailedError);
  });
});

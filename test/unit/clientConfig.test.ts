import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Api2Convert } from '../../src/index.js';
import {
  createConfig,
  DEFAULT_BASE_URL,
  MAX_POLL_TIMEOUT,
  MIN_POLL_INTERVAL,
} from '../../src/index.js';
import { FakeHttpSender } from '../helpers/fakeHttpSender.js';

describe('client configuration', () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.API2CONVERT_API_KEY;
    delete process.env.API2CONVERT_API_KEY;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.API2CONVERT_API_KEY;
    else process.env.API2CONVERT_API_KEY = savedKey;
  });

  it('throws when no key is provided and no env var is set', () => {
    expect(() => new Api2Convert('', { httpSender: new FakeHttpSender() })).toThrow(/No API key/);
  });

  it('falls back to the API2CONVERT_API_KEY env var', async () => {
    process.env.API2CONVERT_API_KEY = 'env-key';
    const http = new FakeHttpSender().addJson(200, { id: 'j' });
    const client = new Api2Convert('', { httpSender: http });
    await client.jobs().get('j');
    expect(http.last().header('X-Api2convert-Api-Key')).toBe('env-key');
  });

  it('an explicit key wins over the env var', async () => {
    process.env.API2CONVERT_API_KEY = 'env-key';
    const http = new FakeHttpSender().addJson(200, { id: 'j' });
    const client = new Api2Convert('explicit', { httpSender: http });
    await client.jobs().get('j');
    expect(http.last().header('X-Api2convert-Api-Key')).toBe('explicit');
  });

  it('exposes the version constant', () => {
    expect(Api2Convert.VERSION).toBe('10.3.1');
  });
});

describe('createConfig clamping', () => {
  it('applies sane defaults', () => {
    const cfg = createConfig('k');
    expect(cfg.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(cfg.timeout).toBe(30);
    expect(cfg.maxRetries).toBe(2);
    expect(cfg.pollInterval).toBe(1);
    expect(cfg.pollMaxInterval).toBe(5);
    expect(cfg.pollTimeout).toBe(300);
  });

  it('floors the poll interval and never lets max fall below it', () => {
    const cfg = createConfig('k', { pollInterval: 0, pollMaxInterval: 0 });
    expect(cfg.pollInterval).toBe(MIN_POLL_INTERVAL);
    expect(cfg.pollMaxInterval).toBe(MIN_POLL_INTERVAL);
  });

  it('caps the poll timeout and never goes negative', () => {
    expect(createConfig('k', { pollTimeout: 10 ** 9 }).pollTimeout).toBe(MAX_POLL_TIMEOUT);
    expect(createConfig('k', { pollTimeout: -5 }).pollTimeout).toBe(0);
  });

  it('enforces a minimum per-request timeout and non-negative retries', () => {
    expect(createConfig('k', { timeout: 0 }).timeout).toBe(1);
    expect(createConfig('k', { maxRetries: -3 }).maxRetries).toBe(0);
  });

  it('trims a trailing slash from the base URL', () => {
    expect(createConfig('k', { baseUrl: 'https://example.com/v2/' }).baseUrl).toBe(
      'https://example.com/v2',
    );
  });
});

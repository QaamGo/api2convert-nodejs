import { describe, expect, it } from 'vitest';

import { NetworkError, ServerError, type HttpRequest } from '../../src/index.js';
import { makeTransport } from '../helpers/testClient.js';

describe('transport retries', () => {
  it('retries 503 -> 429 -> 200 then succeeds', async () => {
    const { transport, http, slept } = makeTransport({ maxRetries: 3 });
    http.addJson(503, {}).addJson(429, {}).addJson(200, { ok: true });
    const res = await transport.request('GET', '/x');
    expect(res).toEqual({ ok: true });
    expect(http.requests.length).toBe(3);
    expect(slept.length).toBe(2);
  });

  it('retries a network error then succeeds', async () => {
    const { transport, http } = makeTransport({ maxRetries: 2 });
    http.addError(new TypeError('fetch failed')).addJson(200, { ok: true });
    expect(await transport.request('GET', '/x')).toEqual({ ok: true });
  });

  it('wraps exhausted network retries in a NetworkError with the cause chained', async () => {
    const original = new TypeError('boom');
    const { transport, http } = makeTransport({ maxRetries: 1 });
    http.addError(original).addError(original);
    const err = (await transport.request('GET', '/x').catch((e: unknown) => e)) as NetworkError;
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.cause).toBe(original);
  });

  it('never blindly retries a bare POST on a 5xx (no duplicate jobs)', async () => {
    const { transport, http } = makeTransport({ maxRetries: 3 });
    http.addJson(500, { message: 'nope' });
    const err = await transport.request('POST', '/jobs', { x: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect(http.requests.length).toBe(1);
  });

  it('retries a POST carrying an Idempotency-Key on a 5xx', async () => {
    const { transport, http } = makeTransport({ maxRetries: 2 });
    http.addJson(500, {}).addJson(200, { ok: true });
    const res = await transport.request('POST', '/jobs', { x: 1 }, undefined, {
      'Idempotency-Key': 'abc',
    });
    expect(res).toEqual({ ok: true });
    expect(http.requests.length).toBe(2);
    expect(http.at(0).header('Idempotency-Key')).toBe('abc');
  });

  it('retries a POST on a 429 even without an Idempotency-Key', async () => {
    const { transport, http } = makeTransport({ maxRetries: 2 });
    http.addJson(429, {}).addJson(200, { ok: true });
    await transport.request('POST', '/jobs', { x: 1 });
    expect(http.requests.length).toBe(2);
  });

  it('never retries a non-replayable (one-shot stream) body', async () => {
    const { transport, http } = makeTransport({ maxRetries: 3 });
    http.addJson(429, { message: 'slow' });
    const req: HttpRequest = {
      method: 'POST',
      url: 'https://up.example.com/upload',
      headers: {},
      makeBody: () => 'streamed-once',
      followRedirects: false,
      replayable: false,
      timeoutMs: 1000,
    };
    const res = await transport.send(req);
    expect(res.status).toBe(429);
    expect(http.requests.length).toBe(1);
  });
});

describe('Retry-After handling', () => {
  it('honors a delay-seconds value (not jittered)', async () => {
    const { transport, http, slept } = makeTransport({ maxRetries: 1 });
    http.addJson(503, {}, { 'Retry-After': '2' }).addJson(200, {});
    await transport.request('GET', '/x');
    expect(slept[0]).toBe(2);
  });

  it('honors an HTTP-date value', async () => {
    const { transport, http, slept } = makeTransport({ maxRetries: 1 });
    http.addJson(503, {}, { 'Retry-After': new Date(Date.now() + 5000).toUTCString() });
    http.addJson(200, {});
    await transport.request('GET', '/x');
    expect(slept[0]).toBeGreaterThanOrEqual(3);
    expect(slept[0]).toBeLessThanOrEqual(6);
  });

  it('clamps an absurd Retry-After to the ceiling', async () => {
    const { transport, http, slept } = makeTransport({ maxRetries: 1 });
    http.addJson(503, {}, { 'Retry-After': '9999' }).addJson(200, {});
    await transport.request('GET', '/x');
    expect(slept[0]).toBe(120);
  });

  it('falls back to exponential backoff when Retry-After is 0', async () => {
    const { transport, http, slept } = makeTransport({ maxRetries: 1 });
    http.addJson(503, {}, { 'Retry-After': '0' }).addJson(200, {});
    await transport.request('GET', '/x');
    expect(slept[0]).toBe(0.5); // base 0.5 * 2^0, rng()=0 -> no jitter
  });
});

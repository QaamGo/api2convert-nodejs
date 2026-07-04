import { describe, expect, it } from 'vitest';

import {
  ApiError,
  AuthenticationError,
  NetworkError,
  NotFoundError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '../../src/index.js';
import { makeClient } from '../helpers/testClient.js';

describe('error mapping', () => {
  const cases: [number, unknown][] = [
    [400, ValidationError],
    [422, ValidationError],
    [401, AuthenticationError],
    [403, AuthenticationError],
    [402, PaymentRequiredError],
    [404, NotFoundError],
    [418, ApiError],
    [500, ServerError],
    [503, ServerError],
  ];

  it.each(cases)('maps HTTP %i to the right error class', async (status, ctor) => {
    const { client, http } = makeClient({ maxRetries: 0 });
    http.addJson(status, { message: 'boom' });
    const err = await client
      .jobs()
      .get('j')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ctor as new () => Error);
    expect((err as ApiError).statusCode).toBe(status);
    expect((err as Error).message).toBe('boom');
  });

  it('captures X-Request-Id and the decoded body', async () => {
    const { client, http } = makeClient({ maxRetries: 0 });
    http.addJson(400, { message: 'Bad target', detail: 'x' }, { 'X-Request-Id': 'req-123' });
    const err = (await client
      .jobs()
      .get('j')
      .catch((e: unknown) => e)) as ValidationError;
    expect(err.requestId).toBe('req-123');
    expect(err.body).toMatchObject({ message: 'Bad target', detail: 'x' });
  });

  it('exposes retryAfter on a 429', async () => {
    const { client, http } = makeClient({ maxRetries: 0 });
    http.addJson(429, { message: 'slow down' }, { 'Retry-After': '30' });
    const err = (await client
      .jobs()
      .get('j')
      .catch((e: unknown) => e)) as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(30);
  });

  it('falls back to the reason phrase when the body has no message', async () => {
    const { client, http } = makeClient({ maxRetries: 0 });
    http.addText(400, '');
    const err = (await client
      .jobs()
      .get('j')
      .catch((e: unknown) => e)) as ValidationError;
    expect(err.message).toBe('Bad Request');
  });

  it('surfaces a non-JSON 2xx body as a NetworkError', async () => {
    const { client, http } = makeClient({ maxRetries: 0 });
    http.addText(200, '<html>not json</html>');
    const err = await client
      .jobs()
      .get('j')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
  });

  it('never leaks the API key into an error message', async () => {
    const { client, http } = makeClient({ maxRetries: 0 }, 'sk_live_super_secret');
    http.addJson(401, { message: 'Invalid API key.' });
    const err = (await client
      .jobs()
      .get('j')
      .catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain('sk_live_super_secret');
    // ...but the key WAS sent as the auth header (the request was authenticated).
    expect(http.last().header('X-Oc-Api-Key')).toBe('sk_live_super_secret');
  });
});

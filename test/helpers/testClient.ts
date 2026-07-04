/**
 * Factories that wire the SDK to a {@link FakeHttpSender} and a recording sleeper,
 * so waits/backoff are instant and requests are inspectable — the Node analog of
 * the Java `A2CTestCase` / Python `conftest.py`.
 */

import { createHmac } from 'node:crypto';

import { Api2Convert } from '../../src/client.js';
import { createConfig, type Api2ConvertOptions } from '../../src/config.js';
import { Transport } from '../../src/transport/transport.js';
import { FakeHttpSender } from './fakeHttpSender.js';

export interface TestClient {
  client: Api2Convert;
  http: FakeHttpSender;
  /** Durations passed to the (no-op) sleeper, in seconds, in order. */
  slept: number[];
}

export function makeClient(options: Api2ConvertOptions = {}, apiKey = 'test-key'): TestClient {
  const http = new FakeHttpSender();
  const slept: number[] = [];
  const client = new Api2Convert(apiKey, {
    httpSender: http,
    sleeper: (s) => {
      slept.push(s);
      return Promise.resolve();
    },
    rng: () => 0, // deterministic: no jitter added on top of the base backoff
    ...options,
  });
  return { client, http, slept };
}

export interface TestTransport {
  transport: Transport;
  http: FakeHttpSender;
  slept: number[];
}

export function makeTransport(options: Api2ConvertOptions = {}): TestTransport {
  const http = new FakeHttpSender();
  const slept: number[] = [];
  const config = createConfig('test-key', options);
  const transport = new Transport(
    http,
    config,
    (s) => {
      slept.push(s);
      return Promise.resolve();
    },
    () => 0,
  );
  return { transport, http, slept };
}

/** Compute the hex HMAC-SHA256 signature the way the server signs webhooks. */
export function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

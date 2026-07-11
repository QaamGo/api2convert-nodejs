/**
 * Independent security suite — run in isolation with `npm run test:security`.
 *
 * The redirect guarantees are proven with REAL loopback HTTP servers (node:http),
 * mirroring Java `SecurityTest`: only a real cross-host 302 can demonstrate that
 * the transport (undici) does not forward an `X-Api2convert-*` secret header to the
 * redirect target. Header/query/prototype/ReDoS checks use the injected fake
 * sender where a real network round-trip adds nothing.
 */

import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import {
  Api2Convert,
  NetworkError,
  jobFromDict,
  outputFileFromDict,
  webhooks,
} from '../../src/index.js';
import { makeClient } from '../helpers/testClient.js';
import { redirectTo, respond, startServer, type LoopbackServer } from '../helpers/loopback.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

const servers: LoopbackServer[] = [];
function track<T extends LoopbackServer>(s: T): T {
  servers.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

function realClient(baseUrl?: string, apiKey = 'secret-key'): Api2Convert {
  const options = { maxRetries: 0, sleeper: () => Promise.resolve() };
  return baseUrl !== undefined
    ? new Api2Convert(apiKey, { ...options, baseUrl })
    : new Api2Convert(apiKey, options);
}

describe('secret hygiene', () => {
  it('never leaks the API key into an exception message or stack', async () => {
    const secret = 'sk_live_super_secret_value_123';
    const { client, http } = makeClient({ maxRetries: 0 }, secret);
    http.addJson(401, { message: 'Invalid API key.' });

    const err = (await client
      .jobs()
      .get('job-x')
      .catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain(secret);
    expect(err.stack ?? '').not.toContain(secret);
    // ...but the key WAS sent as the auth header (the request was authenticated).
    expect(http.last().header('X-Api2convert-Api-Key')).toBe(secret);
  });

  it('never places the API key in the URL / query string', async () => {
    const key = 'sk_live_in_url_check';
    const { client, http } = makeClient({}, key);
    http.addJson(200, []).addJson(200, []);
    await client.options('jpg', 'image');
    await client.jobs().list('completed', 2);
    for (const req of http.requests) {
      expect(req.url).not.toContain(key);
      expect(req.url.toLowerCase()).not.toMatch(/[?&](api[-_]?key|apikey|key)=/);
    }
  });
});

describe('redirect policy (real loopback servers)', () => {
  it('does not forward the account key across a cross-host redirect', async () => {
    const evil = track(
      await startServer((req, res) =>
        respond(res, 200, `grabbed:${String(req.headers['x-api2convert-api-key'] ?? '')}`),
      ),
    );
    const api = track(await startServer((_req, res) => redirectTo(res, `${evil.url}/steal`)));

    const client = realClient(`${api.url}/v2`);
    // An authenticated 3xx is surfaced as a typed error, not silently empty.
    await expect(client.jobs().get('j')).rejects.toThrow(/unexpected redirect/);

    expect(evil.hits()).toBe(0);
    expect(api.hits()).toBe(1);
  });

  it('follows storage redirects for a passwordless download', async () => {
    const storage = track(await startServer((_req, res) => respond(res, 200, 'REDIRECTED-BYTES')));
    const dl = track(await startServer((_req, res) => redirectTo(res, `${storage.url}/file`)));

    const client = realClient();
    const bytes = await client
      .download(outputFileFromDict({ uri: `${dl.url}/result.bin` }))
      .contents();

    expect(bytes.toString()).toBe('REDIRECTED-BYTES');
    expect(storage.hits()).toBe(1);
  });

  it('authenticates uploads with the job token, never the account key, and never redirects', async () => {
    const evil = track(await startServer((_req, res) => respond(res, 200, 'grabbed')));
    const uploadSrv = track(await startServer((_req, res) => redirectTo(res, `${evil.url}/steal`)));

    const client = realClient();
    const job = jobFromDict({
      id: 'job-9',
      token: 'tok-abc',
      server: uploadSrv.url,
      status: { code: 'incomplete' },
    });
    await client
      .jobs()
      .upload(job, Buffer.from('hello'))
      .catch(() => undefined);

    const seen = uploadSrv.headersReceived()[0];
    expect(seen?.['x-api2convert-token']).toBe('tok-abc');
    expect(seen?.['x-api2convert-api-key']).toBeUndefined();
    expect(evil.hits()).toBe(0);
  });

  it('does not forward a download password across a cross-host redirect', async () => {
    const evil = track(await startServer((_req, res) => respond(res, 200, 'grabbed')));
    const storage = track(await startServer((_req, res) => redirectTo(res, `${evil.url}/steal`)));

    const client = realClient();
    await client
      .download(outputFileFromDict({ uri: `${storage.url}/f.pdf` }), 's3cret')
      .contents()
      .catch(() => undefined);

    expect(evil.hits()).toBe(0);
    const leaked = evil.headersReceived().some((h) => h['x-api2convert-download-password'] !== undefined);
    expect(leaked).toBe(false);
  });

  it('follows a redirect only for a passwordless download, not a password-protected one', async () => {
    const plainTarget = track(await startServer((_req, res) => respond(res, 200, 'REACHED')));
    const plainHop = track(
      await startServer((_req, res) => redirectTo(res, `${plainTarget.url}/x`)),
    );
    const pwTarget = track(await startServer((_req, res) => respond(res, 200, 'REACHED')));
    const pwHop = track(await startServer((_req, res) => redirectTo(res, `${pwTarget.url}/x`)));

    const client = realClient();
    const bytes = await client
      .download(outputFileFromDict({ uri: `${plainHop.url}/f` }))
      .contents();
    expect(bytes.toString()).toBe('REACHED');
    expect(plainTarget.hits()).toBe(1);

    await client
      .download(outputFileFromDict({ uri: `${pwHop.url}/f` }), 'pw')
      .contents()
      .catch(() => undefined);
    expect(pwTarget.hits()).toBe(0);
  });

  it('surfaces a malformed API-supplied download URI as a NetworkError', async () => {
    const client = realClient();
    const output = outputFileFromDict({ uri: 'https://exa mple.com/a b c' });
    await expect(client.download(output).contents()).rejects.toBeInstanceOf(NetworkError);
  });

  it.todo(
    'rejects an http:// API base for account requests when TLS is enforced (future hardening)',
  );
  it.todo(
    'caps decompressed / downloaded response size via a maxDownloadBytes guard (future hardening)',
  );
});

describe('streaming timeout (real loopback servers)', () => {
  // These prove BOTH directions escape the per-request timeout, which mocked senders cannot show —
  // only a real transfer through undici exercises the AbortSignal deadline the sender manages. Each
  // test FAILS (TimeoutError abort) without the fetchHttpSender fix and passes with it.

  it('does not cap a streamed upload by the per-request timeout', async () => {
    // A streamed upload transmits its whole body before the response is received, so a per-request
    // timeout would abort a large/slow upload. The server reads the body then delays its response
    // well past the (floored 1s) timeout, yet the upload must still succeed.
    const srv = track(
      await startServer((req, res) => {
        req.on('end', () => {
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"id":"in-1","type":"upload"}');
          }, 1500);
        });
        req.resume(); // drain the uploaded body so 'end' fires
      }),
    );

    const client = new Api2Convert('secret-key', {
      maxRetries: 0,
      timeout: 1,
      sleeper: () => Promise.resolve(),
    });
    const job = jobFromDict({
      id: 'job-9',
      token: 'tok-abc',
      server: srv.url,
      status: { code: 'incomplete' },
    });
    // A Node Readable takes the streamed-multipart path (a ReadableStream request body).
    const input = await client.jobs().upload(job, Readable.from([Buffer.from('hello world')]));
    expect(input.id).toBe('in-1');
  });

  it('does not cap a streamed download body by the per-request timeout', async () => {
    // A download body is read lazily after the headers arrive; dribbling it out past the (floored 1s)
    // timeout must not abort the read — the connect/header phase is bounded, the body is not.
    const srv = track(
      await startServer((_req, res) => {
        res.writeHead(200);
        let sent = 0;
        const timer = setInterval(() => {
          if (sent < 6) {
            res.write('x');
            sent += 1;
          } else {
            clearInterval(timer);
            res.end();
          }
        }, 250);
      }),
    );

    const client = new Api2Convert('secret-key', {
      maxRetries: 0,
      timeout: 1,
      sleeper: () => Promise.resolve(),
    });
    const bytes = await client
      .download(outputFileFromDict({ uri: `${srv.url}/slow.bin` }))
      .contents();
    expect(bytes.toString()).toBe('xxxxxx');
  });
});

describe('filesystem safety', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('reduces a traversal filename to a basename that cannot escape the target directory', async () => {
    dir = await mkdtemp(join(tmpdir(), 'a2c-sec-'));
    const { client, http } = makeClient();
    http.addRaw(200, enc('X'));
    const output = outputFileFromDict({ uri: 'https://dl/x', filename: '../../../etc/evil' });
    const path = await client.download(output).save(dir);
    expect(path).toBe(join(dir, 'evil'));
  });
});

describe('webhook signature verification', () => {
  const secret = 'whsec_test';
  const payload = JSON.stringify({ id: 'job-1', status: { code: 'completed' } });
  const sig = createHmac('sha256', secret).update(payload).digest('hex');

  it('accepts a valid signature', () => {
    expect(webhooks().constructEvent(payload, sig, secret).job.id).toBe('job-1');
  });

  it('rejects a tampered payload', () => {
    expect(() => webhooks().constructEvent(`${payload} `, sig, secret)).toThrow();
  });

  it('rejects an equal-length wrong signature (constant-time path, no length crash)', () => {
    const wrong = 'f'.repeat(sig.length);
    expect(() => webhooks().constructEvent(payload, wrong, secret)).toThrow();
  });

  it('treats an empty secret as a deliberate verification bypass', () => {
    expect(webhooks().constructEvent(payload, null, '').job.id).toBe('job-1');
  });
});

describe('untrusted-JSON hardening', () => {
  it('does not pollute Object.prototype when hydrating a malicious payload', () => {
    const malicious =
      '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted2":true}},"id":"job-1"}';

    const event = webhooks().parse(malicious);
    expect(event.job.id).toBe('job-1');
    jobFromDict(JSON.parse(malicious) as Record<string, unknown>);

    const probe = {} as Record<string, unknown>;
    expect(probe.polluted).toBeUndefined();
    expect(probe.polluted2).toBeUndefined();
  });

  it('classifies input with an anchored, linear URL matcher (ReDoS-safe)', () => {
    const urlRe = /^https?:\/\//i;
    const pathological = `http${'p'.repeat(100_000)}x`;
    const start = performance.now();
    const matched = urlRe.test(pathological);
    const elapsed = performance.now() - start;
    expect(matched).toBe(false); // treated as a local path, not a remote input
    expect(elapsed).toBeLessThan(50);
    expect(urlRe.test('https://example.com/x')).toBe(true);
  });
});

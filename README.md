# API2Convert Node.js SDK

[![CI](https://github.com/QaamGo/api2convert-nodejs/actions/workflows/ci.yml/badge.svg)](https://github.com/QaamGo/api2convert-nodejs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@api2convert/sdk)](https://www.npmjs.com/package/@api2convert/sdk)
![Node](https://img.shields.io/badge/node-%E2%89%A5%2018-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

The official Node.js/TypeScript client for the [API2Convert](https://www.api2convert.com)
file-conversion API. Convert, compress and transform **images, documents, audio, video, ebooks,
archives and CAD** — and run operations like OCR, merge, thumbnail and website capture — in one line
of code.

```ts
import { Api2Convert } from '@api2convert/sdk';

const client = new Api2Convert('YOUR_API_KEY');

const result = await client.convert('invoice.docx', 'pdf');
await result.save('invoice.pdf');
```

That single call creates a job, uploads your file, starts it, waits for it to finish and gives you
back a result you can save. No polling loops, no manual upload handling.

## Requirements

- Node.js 18+ (uses the built-in global `fetch`, `Blob`, `FormData` and `crypto`).
- **Zero runtime dependencies.** The HTTP layer is the platform `fetch` (undici); HMAC uses
  `node:crypto`. Ships as dual **ESM + CommonJS** with TypeScript types.

## Install

```bash
npm install @api2convert/sdk
```

Get an API key from the [API2Convert dashboard / documentation](https://www.api2convert.com/documentation).

## Quick start

```ts
import { Api2Convert } from '@api2convert/sdk';

// Reads the API2CONVERT_API_KEY environment variable when no key is passed.
const client = new Api2Convert('YOUR_API_KEY');

// 1) From a local file
await (await client.convert('photo.png', 'jpg')).save('photo.jpg');

// 2) From a URL
await (await client.convert('https://example.com/photo.png', 'jpg')).save('photo.jpg');

// 3) With conversion options (discover them via client.options('jpg'))
const result = await client.convert('photo.png', 'jpg', { quality: 85, width: 1280, height: 720 });
await result.save('out/'); // the processed-file directory
```

`convert(input, to, options?, opts?)` — `input` is a **local path string, a public URL, a
`Uint8Array`/`Buffer`, a Node `Readable`, or a web `ReadableStream`**; `to` is the **target format**;
`options` are the **conversion options** for that target. Less-common controls live on the `opts`
object (so they can never collide with an open-ended API option): `category`, `timeout`,
`outputIndex`, `filename`, `downloadPassword`. The returned `ConversionResult` lets you:

```ts
const result = await client.convert('report.docx', 'pdf');

await result.save('report.pdf'); // stream to a file
await result.save('downloads/'); // ...or a directory (keeps the server filename)
const bytes = await result.contents(); // ...or get the raw Buffer
const url = result.url(); // ...or just the download URL
```

## Password-protect the result

Pass a `downloadPassword` and the output is locked behind it. The SDK remembers the password and
sends it automatically when you download — you don't pass it again:

```ts
const result = await client.convert('statement.docx', 'pdf', null, { downloadPassword: 'hunter2' });
await result.save('statement.pdf'); // the password is applied for you
```

The download URL still needs the password from anywhere else (a browser, cURL, another process), via
the `X-Oc-Download-Password` header. When you already hold an `OutputFile` — e.g. from the Jobs API —
hand the password to `download()`:

```ts
await client.download(output, 'hunter2').save('out/');
```

## Asynchronous conversions & webhooks

For long-running jobs, start the conversion and get notified via a webhook instead of waiting:

```ts
const job = await client.convertAsync('movie.mov', 'mp4', null, {
  callback: 'https://your-app.example.com/webhooks/api2convert',
});
```

In your webhook handler, verify and parse the callback:

```ts
import { Api2Convert, SignatureVerificationError } from '@api2convert/sdk';

const payload = rawBody; // the RAW request body (string or Buffer)
const signature = req.headers['x-oc-signature'];

try {
  const event = Api2Convert.webhooks().constructEvent(payload, signature, 'YOUR_WEBHOOK_SECRET');
  const job = event.job;
  // ... react to job.status.code ...
} catch (err) {
  if (err instanceof SignatureVerificationError) {
    // respond 400
  }
}
```

> Signed webhooks are being rolled out. Until they are enabled for your account no signature is sent
> — call `Api2Convert.webhooks().parse(payload)` (or pass an empty secret) to deserialize the
> callback without verifying.

## Error handling

Every failure is an exception extending `Api2ConvertError`:

```ts
import {
  AuthenticationError,
  ConversionFailedError,
  RateLimitError,
  ValidationError,
} from '@api2convert/sdk';

try {
  await (await client.convert('photo.png', 'jpg')).save('photo.jpg');
} catch (err) {
  if (err instanceof ValidationError) {
    // bad target / option — err.message explains
  } else if (err instanceof AuthenticationError) {
    // bad or missing API key
  } else if (err instanceof RateLimitError) {
    // too many requests — retry after err.retryAfter seconds
  } else if (err instanceof ConversionFailedError) {
    // the job failed — inspect err.errors()
  }
}
```

| Error                        | When                                                     |
| ---------------------------- | -------------------------------------------------------- |
| `AuthenticationError`        | 401 / 403 — bad or missing key                           |
| `PaymentRequiredError`       | 402 — no remaining quota                                 |
| `ValidationError`            | 400 / 422 — invalid request (e.g. unknown target)        |
| `NotFoundError`              | 404 — resource doesn't exist                             |
| `RateLimitError`             | 429 — exposes `retryAfter`                               |
| `ServerError`                | 5xx                                                      |
| `ConversionFailedError`      | the job reached `failed`; exposes `.job` and `.errors()` |
| `ConversionTimeoutError`     | the job didn't finish within the poll timeout            |
| `NetworkError`               | a transport failure / non-JSON response / malformed URL  |
| `SignatureVerificationError` | a webhook payload failed verification                    |

Transient failures (429, 5xx, network errors) are **retried automatically** with jittered exponential
backoff. A non-idempotent `POST` (e.g. creating a job) is never blindly retried, so a transient error
can't create a duplicate job — pass an idempotency key to make it retry-safe:
`client.jobs().create(payload, 'my-idempotency-key')`.

## Power user: the full job API

`convert()` is sugar over the Jobs API. Drop down to it for compound jobs, merges, presets, custom
polling or job chaining:

```ts
const job = await client.jobs().create({
  process: false,
  conversion: [{ target: 'pdf', options: { pdf_a: true } }],
});

await client.jobs().upload(job, 'contract.docx'); // local file
await client.jobs().addInput(job.id, {
  type: 'remote',
  source: 'https://example.com/appendix.docx',
});

await client.jobs().start(job.id);
const done = await client.jobs().wait(job.id, 120); // poll to completion (120s timeout)

for (const output of done.output) {
  await client.download(output).save('out/');
}
```

Available resources: `jobs()`, `conversions()` (the catalog + option discovery), `presets()`,
`stats()`, `contracts()`.

Discover the valid options for any target:

```ts
const options = await client.options('jpg'); // -> { quality: {...}, width: {...}, ... }
```

## Configuration

```ts
const client = new Api2Convert('YOUR_API_KEY', {
  timeout: 30, // per-request network timeout (seconds)
  maxRetries: 2, // automatic retries for transient failures
  pollInterval: 1.0, // first poll interval when waiting (seconds)
  pollMaxInterval: 5.0, // backoff cap (seconds)
  pollTimeout: 300, // give up waiting after this many seconds
});
```

Bring your own HTTP transport by implementing `HttpSender` and passing it as `httpSender`, or supply
a custom `fetch` via `new FetchHttpSender(myFetch)`.

## Security — never publish your API key

- **Never hard-code or commit your API key.** Load it from the environment (`API2CONVERT_API_KEY`) or
  a secrets manager.
- In CI, store it as a **masked & protected** secret and never print it to logs.
- Treat the per-job upload **token** and your **webhook signing secret** with the same care.
- The SDK never logs your key/token and never puts them in exception messages. A request carrying any
  secret header never follows a redirect (a redirect could otherwise forward the secret to another
  host); only the self-contained, no-secret download path follows redirects.
- If a key is ever exposed, **revoke and rotate it** in the API2Convert dashboard immediately.

See [`SECURITY.md`](SECURITY.md).

## Development

```bash
npm run check          # lint + typecheck + unit tests + security suite + audit
npm test               # offline unit tests only
npm run test:security  # the independent security suite (real loopback servers)
npm run build          # emit dual ESM + CJS + type declarations to dist/
```

Live conformance tests run against the real API when `API2CONVERT_API_KEY` is set (they auto-skip
otherwise):

```bash
API2CONVERT_API_KEY=... npm run test:live
```

The [live conformance suite](test/live/conformance.test.ts) doubles as an executable, end-to-end
tour of the SDK — each test is a self-contained usage example:

1. **Convert a remote URL** — the one-call happy path.
2. **Upload and convert a local file** — the multipart upload path.
3. **Convert with options** — apply target-specific conversion options.
4. **Discover the catalog** — list conversions and option schemas.
5. **Drive the job lifecycle by hand** — create → add input → start → wait → inspect.
6. **Handle a validation error** — an unknown target is a typed error.
7. **Handle an authentication error** — a bad key is typed and never leaked.

It runs automatically against the real API on every release tag (see
`.github/workflows/live-conformance.yml`), so a published version is always verified end to end.
Runnable single-purpose examples live in [`examples/`](examples/).

This SDK is hand-written and kept in sync with the API by an AI agent — see [`AGENTS.md`](AGENTS.md)
and [`docs/SDK_CONTRACT.md`](docs/SDK_CONTRACT.md). Notable changes are recorded in
[`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## License

MIT — see [`LICENSE`](LICENSE).

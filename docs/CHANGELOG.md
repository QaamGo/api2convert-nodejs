# Changelog

All notable changes to this package are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [10.2.0] - 2026-07-04

First public release of the official, hand-written Node.js/TypeScript SDK (`@api2convert/sdk`),
targeting Node.js 18+. Behaviorally equivalent to the PHP, Python and Java SDKs — the same
language-agnostic contract in [`SDK_CONTRACT.md`](SDK_CONTRACT.md).

### Core

- One-call `convert(input, to, options?, opts?)` that hides the create → upload → start → poll →
  download lifecycle, plus `convertAsync()` for webhook-driven flows and `download()` helpers.
- `input` accepts a local path, a public URL, a `Uint8Array`/`Buffer`, a Node `Readable` or a web
  `ReadableStream`. `ConversionResult` / `FileDownload` expose `save()`, `contents()`, `url()`,
  `output()` / `outputs()`, with transparent download-password handling.
- Full Jobs / Conversions / Presets / Stats / Contracts resources, and standalone webhook
  verification (`Api2Convert.webhooks()` / `webhooks()`) using HMAC-SHA256 with a constant-time
  comparison.

### Reliability & security

- Automatic retries with capped, jittered exponential backoff honoring `Retry-After` (seconds and
  HTTP-date forms); 429 retried for all methods, 5xx/network only for idempotent methods or a request
  carrying an `Idempotency-Key`; a bare non-idempotent `POST` is never blindly retried.
- Poll interval floored (0.5s) and total wait capped (4h) so no configuration can busy-loop or poll
  unbounded; a monotonic deadline bounds the real wall-clock wait.
- Any request carrying an `X-Oc-*` secret header is sent with `redirect: 'manual'`, so the account
  key / upload token / download password can never leak across a cross-host redirect; only a
  passwordless download follows redirects. Proven by an independent security suite against real
  loopback servers.
- Typed error hierarchy (`Api2ConvertError` and subclasses); secrets never appear in messages/logs.
  Directory downloads sanitize the API filename (no path traversal); untrusted JSON hydration is
  prototype-pollution-safe.

### Implementation

- TypeScript, built to dual **ESM + CommonJS** with `.d.ts` declarations (tsup).
- **Zero runtime dependencies** — HTTP via the global `fetch` (undici), HMAC via `node:crypto`,
  multipart via `FormData`/`Blob` (bytes) or a streamed manual multipart (`Readable`).
- Pluggable `HttpSender` seam and an injectable sleeper/rng for deterministic tests.

### Node/TS-idiom notes (vs. the contract)

- Every I/O method returns a `Promise`; the poll method keeps the contract name `wait()` (unlike
  Java's `await`); exceptions are named `...Error`; models are frozen POJO interfaces with `fromDict`
  factories and a single `number` for `size`.

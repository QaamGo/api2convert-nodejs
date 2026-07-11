# AGENTS — maintaining the API2Convert Node.js SDK

This SDK is **hand-written** (not generated from OpenAPI) and kept in sync with the API by a human
**or an AI agent**. This file is the playbook. The model: a committed spec snapshot is the diff
baseline, a fixed behavior contract protects the ergonomics, and the Vitest suite is the guardrail.

It is one of four official ports (PHP, Python, Java, Node.js) that all implement the same
language-agnostic contract in [`docs/SDK_CONTRACT.md`](docs/SDK_CONTRACT.md).

## Why hand-written

The conversion flow is multi-step (create → upload → poll → download) and the **upload step is not in
the OpenAPI spec at all**, so a generator cannot produce a usable client. We optimise for a
junior-friendly surface — one-call `convert()` — and use AI to keep it current.

## Repo layout

| Path                               | What it is                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/client.ts`                    | The client + the `convert()` / `convertAsync()` façade. **Hand-authored.**                        |
| `src/result.ts`                    | `ConversionResult` + `FileDownload` helpers. **Hand-authored.**                                   |
| `src/upload/fileUploader.ts`       | Multipart upload to the per-job server. **Hand-authored** (not in the spec).                      |
| `src/webhook.ts`                   | Webhook HMAC verification + parsing. **Hand-authored.**                                           |
| `src/resources/*`                  | One class per API tag (Jobs, Conversions, Presets, Stats, Contracts). **Derived** from the spec.  |
| `src/models/*`, `src/enums/*`      | Typed DTOs (`fromDict` factories) / enums. **Derived** from the spec.                             |
| `src/transport/*`                  | Transport: auth, retries/backoff, error mapping, redirect policy, the `HttpSender` seam.          |
| `src/errors.ts`                    | The typed exception hierarchy.                                                                    |
| `openapi/api2convert.openapi.json` | **Committed spec snapshot** the SDK targets — the diff baseline (keep md5-identical to siblings). |
| `docs/SDK_CONTRACT.md`             | The fixed, language-agnostic public surface + semantics (keep md5-identical to siblings).         |
| `test/unit/*`                      | Offline golden tests (`FakeHttpSender`). **The guardrail.**                                       |
| `test/security/*`                  | The independent security suite (real loopback servers). **The redirect/leak guardrail.**          |
| `test/live/*`                      | Live conformance (auto-skips without `API2CONVERT_API_KEY`).                                      |

## How to update the SDK to a new API version

1. **Refresh the snapshot.** Overwrite `openapi/api2convert.openapi.json` from
   `https://api.api2convert.com/v2/openapi.json` (or `/v2/schema`) and `git diff` it.
2. **Diff it** — new/removed/renamed operations, new fields, new enum values.
3. **Update the DERIVED layer to match the diff, and nothing else:**
   - New/changed fields → update the relevant `models/*` interface + its `fromDict`.
   - New operation → add a method on the matching `resources/*` class (mirror the existing style).
   - New input/output target types → extend the matching `enums/*`.
4. **Do NOT change the hand-authored public API** (`convert`, `convertAsync`, `download`, upload,
   polling, webhook verification, error classes) unless `docs/SDK_CONTRACT.md` changes first. If a
   real product change requires it, update the contract in the same change and bump the **major**
   version.
5. **Lint + test (the guardrail):**
   ```bash
   npm run check     # lint + typecheck + unit tests + security suite + audit — all must pass
   ```
   Add or update a golden test for any new behavior. Keep the live conformance test runnable.
6. **Record + version.** Add a `docs/CHANGELOG.md` entry and bump the version in `package.json` and
   `src/version.ts` per SemVer (additive spec change → minor; breaking public-surface change → major).

## Guarantees to uphold (don't break these)

- **Never commit a real API key, token or secret** — not in source, tests, fixtures, examples, CI
  files or commit messages, and never publish one anywhere. Keys come only from environment variables
  (`API2CONVERT_API_KEY`) or masked/protected CI variables; tests use obvious fakes (`test-key`,
  `whsec_test`, ...). The SDK must never log or expose a key/token in errors. Secret-scan before any
  release.
- **The contract is law.** Public method names, signatures and semantics match `docs/SDK_CONTRACT.md`
  across every SDK language. Adapt only to Node/TS idiom (see divergences below).
- **Upload uses the per-job `X-Api2convert-Token`, never the account key.** There is a test for this.
- **Secret-bearing requests never follow redirects.** The key/token/download-password ride in custom
  `X-Api2convert-*` headers that undici would forward across hosts on a `redirect: 'follow'`. Only the
  no-secret download path follows redirects. `redirect: 'follow'` is ESLint-forbidden outside
  `src/transport/fetchHttpSender.ts`, and `test/security` proves the guarantee with real servers.
- **`convert()` stays one call** for the common case (path/URL/stream → `to` → `save()`).
- **Transient failures retry; failures surface as typed exceptions.** Never leak a raw fetch/transport
  error (wrap it in `NetworkError`). A non-idempotent `POST` is never blindly retried.
- **Node 18+, zero runtime dependencies, global `fetch` + `node:crypto`.** Don't add runtime deps.

## Node/TS-idiom divergences from the contract

The contract fixes names and semantics; these are the _only_ places Node deviates, all for idiom:

- **Every I/O method returns a `Promise`** (Node is non-blocking). `convert()` returns
  `Promise<ConversionResult>`; `save()` / `contents()` and every resource method are `async`.
  `download()` and options-object construction stay synchronous (no I/O until `save`/`contents`).
- **The poll-to-completion method is `wait()`** — the contract's original name. (Java diverged to
  `await` only because `Object.wait` is reserved; JS has no such clash, and `await` is a reserved
  word, so Node keeps `wait`, matching Python/PHP.)
- **Exceptions are named `...Error`** (JS/Python convention), extend `Error`, and set a real `.name`
  and an `instanceof`-safe prototype chain. `ConversionTimeoutError` (not `TimeoutError`).
- **Resource accessors are methods** (`jobs()`); the "extra" `convert()` controls are an options
  object (`ConvertOptions` / `AsyncOptions`), kept separate from the open-ended options map exactly as
  the contract requires. `input` accepts a `string` path/URL, `Uint8Array`/`Buffer`, Node `Readable`
  or web `ReadableStream`.
- **Models are frozen POJO interfaces + `fromDict` factories** (structural typing); `Job` carries
  precomputed `isCompleted` / `isFailed` / `isCanceled` / `isTerminal` booleans and keeps `raw`.
  `size` is a single `number | null` (a JS number is a 64-bit double, safe past any real file size).
- **Redirect control is per-request** (`fetch`'s `redirect` option) rather than two client objects.

## Conventions

- Models parse defensively via `support/data` (tolerate missing/extra fields — never throw on a
  surprising payload during hydration; no prototype pollution). `job.raw` keeps the full response.
- Resource methods are thin: build the request, call `Transport`, hydrate a model.
- Keep the README quickstart copy-pasteable; if you change the happy path, update the README example.

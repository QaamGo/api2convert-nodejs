# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a security problem in this SDK.

Report it privately through GitHub's **"Report a vulnerability"** button under the repository's
_Security_ tab (private vulnerability reporting). If that is unavailable, use the support channels at
<https://www.api2convert.com>. Please avoid disclosing details publicly until a fix has been released.

## Secrets this SDK handles

The library handles three secrets on the caller's behalf — keep all of them out of source control and
configure them via environment variables or a secret manager:

- the **account API key** (`X-Oc-Api-Key`) — read from configuration/environment
  (`API2CONVERT_API_KEY`) and sent only over TLS to the API host, never in a URL query string;
- the **per-job upload token** (`X-Oc-Token`) — used to authenticate uploads to the per-job upload
  server; the account key is **never** sent there;
- the **webhook signing secret** — used locally to verify callback signatures (HMAC-SHA256 over the
  raw request body, constant-time comparison via `crypto.timingSafeEqual`). The signature is delivered
  in the `X-Oc-Signature` header.

## Guarantees

- The SDK never logs a key/token and never places one in an exception message.
- A request that carries **any secret in a custom header never follows HTTP redirects** — a redirect
  could otherwise forward the secret to another host. `fetch` follows redirects by default and undici
  forwards custom `X-Oc-*` headers across a cross-origin redirect (the Fetch spec only strips
  `Authorization` / `Cookie`), so every secret-bearing request is sent with `redirect: 'manual'`.
  This covers the account key (`X-Oc-Api-Key`), the per-job upload token (`X-Oc-Token`) **and** a
  download password (`X-Oc-Download-Password`). Only a plain, passwordless download (`GET output.uri`,
  which carries no secret) follows redirects, so storage/CDN URLs still resolve. A cross-host redirect
  test suite (`test/security`) proves this against real loopback servers.
- A directory download uses a sanitized basename derived from the API-supplied filename, so a
  malicious name (e.g. `../../evil`) cannot escape the target directory.
- Untrusted JSON is hydrated without mutating `Object.prototype` (no prototype pollution), and the
  input-type URL matcher is anchored and linear (no catastrophic backtracking).
- Transient failures are retried with capped, jittered backoff; a non-idempotent `POST` is never
  blindly retried, so a transient error cannot create a duplicate job.

If a key is ever exposed, revoke and rotate it in the API2Convert dashboard immediately.

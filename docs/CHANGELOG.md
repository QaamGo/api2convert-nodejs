# Changelog

All notable changes to this package are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [10.4.1] - 2026-08-12

### Fixed

- Replaced the trailing-separator regex trims (`/\/+$/`) in `config.ts`, `result.ts` and
  `fileUploader.ts` with a linear reverse scan (`trimTrailing`). CodeQL flagged the patterns as
  polynomial ReDoS: a string ending in a long run of separators cost O(n²), and `job.server`
  comes from the API while `baseUrl` comes from caller config. Identical semantics, linear time.

### Security

- Dev toolchain only: pinned transitive `esbuild` to `^0.28.1` via npm `overrides`
  (GHSA: dev-server arbitrary file read on Windows; tsup still requires `^0.27`).
  The published package is unaffected — esbuild is a devDependency and only `dist/` ships.

## [10.4.0] - 2026-08-07

Supported-runtime change and dev-toolchain security update. No API changes.

### Changed

- **Node 18 is no longer supported; the `engines` floor is now `>=20`.** Node 18 reached
  end of life in April 2025, and vitest 4 cannot start on it at all (rolldown imports
  `node:util#styleText`, added in 20.12), so the Node 18 CI leg could no longer test
  anything. The package still ships zero runtime dependencies and very likely runs on 18,
  but support is only claimed for what CI exercises.

### Security

- Upgraded the dev toolchain — vitest 4, `@vitest/coverage-v8` 4, eslint 10, `@eslint/js` 10,
  `@types/node` 26 — taking `npm audit` from 9 vulnerabilities (2 critical, 4 high) to 1 low.
  These are build-time only and never reach consumers of the published package.
- `@types/node` 26 narrowed `BlobPart` to exclude `SharedArrayBuffer`-backed views, so the
  `Uint8Array` upload path carries an assertion rather than a copy that would double peak
  memory on large uploads. Types only — no runtime change.

> TypeScript stays on 5.9: 7.0 is the native Go compiler port and ships no JS compiler API,
> which neither tsup's dts build nor typescript-eslint can currently work with.

> Note: 10.3.0 and 10.3.1 shipped without changelog entries; this file jumps from 10.2.1 to 10.4.0.

## [10.2.1] - 2026-07-08

- Lock-step version bump to keep all API2Convert SDKs on 10.2.1. No library/runtime changes since
  10.2.0 (the redirect / download-password hardening already shipped); added a runnable example per
  documented guide and expanded the live-conformance suite to seven canonical scenarios.
- First tag-driven publish via the `release.yml` workflow.

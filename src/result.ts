/**
 * Conversion result and download helpers.
 *
 * {@link ConversionResult} wraps a completed job; {@link FileDownload} streams a
 * single output file to disk or memory. Both remember a download password
 * supplied at conversion time and send it automatically on download.
 */

import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { Api2ConvertError, NetworkError } from './errors.js';
import type { Job } from './models/job.js';
import type { OutputFile } from './models/outputFile.js';
import type { Transport } from './transport/transport.js';

/** A downloadable output file. Returned by `client.download(output)`. */
export class FileDownload {
  private readonly transport: Transport;
  private readonly output: OutputFile;
  private readonly downloadPassword: string | null;

  constructor(transport: Transport, output: OutputFile, downloadPassword?: string) {
    this.transport = transport;
    this.output = output;
    this.downloadPassword = downloadPassword ?? null;
  }

  /** The self-contained download URL (no auth required). */
  url(): string {
    return this.output.uri;
  }

  /**
   * Stream the file to disk. `pathOrDir` is a file path, or a directory (the API
   * filename is used). A password set at conversion time is applied automatically;
   * pass one here only to override it. Returns the path written to.
   */
  async save(pathOrDir: string, downloadPassword?: string): Promise<string> {
    const target = await this.resolveTarget(pathOrDir);
    const parent = dirname(target) || '.';
    try {
      await mkdir(parent, { recursive: true });
    } catch (cause) {
      throw new Api2ConvertError(`Could not create directory: ${parent}`, { cause });
    }

    const response = await this.transport.openDownload(
      this.output.uri,
      this.headers(downloadPassword),
    );

    // Stream to a sibling temp file and rename over the target only after a clean write+close. This
    // never truncates the target up front and never destroys a pre-existing complete file on a
    // mid-stream failure — a download either fully replaces the target or leaves it untouched.
    const temp = join(parent, `.a2c-download-${randomBytes(8).toString('hex')}.part`);
    try {
      // `typedRead` re-types a network read failure as a NetworkError; `pipeline` awaits the write
      // stream's flush+close, so a truncated-on-close write surfaces as an error, not a silent success.
      await pipeline(typedRead(response.stream()), createWriteStream(temp));
      await rename(temp, target);
    } catch (cause) {
      // Remove the partial temp file; the pre-existing target (if any) is left untouched.
      await unlink(temp).catch(() => undefined);
      // A read-side (network) failure arrives already typed as a NetworkError; reaching past that
      // means a write / flush / rename fault — a genuine filesystem error.
      if (cause instanceof Api2ConvertError) throw cause;
      throw new Api2ConvertError(`Could not write file: ${target}`, { cause });
    }
    return target;
  }

  /** Download the file and return its contents (loads into memory). */
  async contents(downloadPassword?: string): Promise<Buffer> {
    const response = await this.transport.openDownload(
      this.output.uri,
      this.headers(downloadPassword),
    );
    try {
      return Buffer.from(await response.bytes());
    } catch (cause) {
      // Reading the response body is a network operation; a mid-stream failure is a transport error,
      // so surface it as a typed NetworkError rather than the base type.
      throw new NetworkError('The download was interrupted.', { cause });
    }
  }

  private async resolveTarget(pathOrDir: string): Promise<string> {
    const looksLikeDir =
      pathOrDir.endsWith('/') || pathOrDir.endsWith('\\') || (await isDirectory(pathOrDir));
    if (looksLikeDir) {
      const name = safeName(this.output.filename) ?? safeName(this.output.id) ?? 'output';
      return join(pathOrDir.replace(/[/\\]+$/, ''), name);
    }
    return pathOrDir;
  }

  private headers(downloadPassword?: string): Record<string, string> {
    const password = downloadPassword ?? this.downloadPassword;
    return password !== null ? { 'X-Api2convert-Download-Password': password } : {};
  }
}

/**
 * The result of a completed conversion.
 *
 * The common case is one output: `await result.save('out.pdf')`. Jobs that produce
 * several files expose them via {@link outputs} and {@link download}.
 */
export class ConversionResult {
  /** The completed job. */
  readonly job: Job;
  private readonly transport: Transport;
  private readonly index: number;
  private readonly downloadPassword: string | null;

  constructor(job: Job, transport: Transport, index = 0, downloadPassword?: string) {
    this.job = job;
    this.transport = transport;
    this.index = index;
    this.downloadPassword = downloadPassword ?? null;
  }

  /** The selected output file (the first one by default). */
  output(): OutputFile {
    // Any index not present — including a negative one — raises rather than
    // wrapping around (mirrors the siblings' `output[index] ?? throw`).
    const output = this.job.output[this.index];
    if (this.index < 0 || output === undefined) {
      throw new Api2ConvertError('The job produced no output files.');
    }
    return output;
  }

  /** All output files produced by the job. */
  outputs(): readonly OutputFile[] {
    return this.job.output;
  }

  /** The download URL of the selected output (self-contained, no auth). */
  url(): string {
    return this.output().uri;
  }

  /** Download the selected output to disk. Returns the path written to. */
  async save(pathOrDir: string, downloadPassword?: string): Promise<string> {
    return this.download().save(pathOrDir, downloadPassword);
  }

  /** Download the selected output and return its contents (loads into memory). */
  async contents(downloadPassword?: string): Promise<Buffer> {
    return this.download().contents(downloadPassword);
  }

  /** A {@link FileDownload} for a specific output (defaults to the selected one). */
  download(output?: OutputFile): FileDownload {
    return new FileDownload(
      this.transport,
      output ?? this.output(),
      this.downloadPassword ?? undefined,
    );
  }
}

/**
 * Iterate the download body, attributing a mid-stream failure to the correct side: a read fault on
 * the network response surfaces as a typed {@link NetworkError}, while a write fault (raised by the
 * consuming write stream) propagates untyped for the caller to label as a filesystem error.
 */
async function* typedRead(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    for (;;) {
      let next: IteratorResult<Uint8Array>;
      try {
        next = await iterator.next();
      } catch (cause) {
        throw new NetworkError('The download was interrupted.', { cause });
      }
      if (next.done === true) return;
      yield next.value;
    }
  } finally {
    // Early termination (e.g. a write failure aborting the pipeline) must release the source's
    // reader lock — we drive the iterator by hand, so propagate the close explicitly.
    await iterator.return?.();
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Reduce an API-supplied name to a bare filename safe to append to a directory.
 *
 * `output.filename` / `output.id` come straight from the API JSON, so a value
 * like `../../etc/cron.d/evil` (or one with separators or a NUL byte) must never
 * escape the caller's chosen directory. Returns `null` when nothing usable
 * remains, so the caller can fall back.
 */
function safeName(name: string | null): string | null {
  if (name === null) return null;
  const cleaned = name.replace(/\0/g, '').replace(/\\/g, '/');
  const base = posix.basename(cleaned).trim();
  if (base === '' || base === '.' || base === '..') return null;
  return base;
}

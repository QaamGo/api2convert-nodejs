/**
 * Conversion result and download helpers.
 *
 * {@link ConversionResult} wraps a completed job; {@link FileDownload} streams a
 * single output file to disk or memory. Both remember a download password
 * supplied at conversion time and send it automatically on download.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { Api2ConvertError } from './errors.js';
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
    try {
      await pipeline(response.stream(), createWriteStream(target));
    } catch (cause) {
      // A mid-stream failure leaves a truncated file on disk; remove it so a
      // partial download is never mistaken for a complete one (best-effort).
      await unlink(target).catch(() => undefined);
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
    return Buffer.from(await response.bytes());
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
    return password !== null ? { 'X-Oc-Download-Password': password } : {};
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

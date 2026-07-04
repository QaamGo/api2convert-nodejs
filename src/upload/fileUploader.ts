/**
 * Uploads a local file to a job's per-job upload server.
 *
 * This step is intentionally hand-written — it is NOT described by the OpenAPI
 * spec. It posts a `multipart/form-data` body (field `file`) to
 * `{job.server}/upload-file/{job.id}` and authenticates with the per-job
 * `X-Oc-Token` header — never the account API key. Stream inputs are streamed, so
 * large files are not read into memory. Internal.
 */

import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Readable } from 'node:stream';

import type { ConvertInput } from '../convertOptions.js';
import { Api2ConvertError } from '../errors.js';
import { inputFileFromDict, type InputFile } from '../models/inputFile.js';
import type { Job } from '../models/job.js';
import { asObject } from '../support/data.js';
import type { FetchBody, HttpRequest } from '../transport/httpSender.js';
import type { Transport } from '../transport/transport.js';

interface BuiltBody {
  makeBody: () => FetchBody;
  replayable: boolean;
  contentType?: string;
}

export class FileUploader {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async upload(job: Job, file: ConvertInput, filename?: string): Promise<InputFile> {
    if (!job.server || job.token === null) {
      throw new Api2ConvertError(
        'Cannot upload: the job has no upload server/token. ' +
          'Create the job with process=false and upload before starting it.',
      );
    }

    const url = job.server.replace(/\/+$/, '') + '/upload-file/' + job.id;
    const built = await this.buildBody(file, filename);

    const headers: Record<string, string> = { 'X-Oc-Token': job.token };
    if (built.contentType !== undefined) headers['Content-Type'] = built.contentType;

    const request: HttpRequest = {
      method: 'POST',
      url,
      headers,
      makeBody: built.makeBody,
      followRedirects: false,
      replayable: built.replayable,
      timeoutMs: this.transport.config.timeout * 1000,
    };

    const decoded = await this.transport.interpret(await this.transport.send(request));
    return inputFileFromDict(asObject(decoded));
  }

  private async buildBody(file: ConvertInput, filename: string | undefined): Promise<BuiltBody> {
    // Local file path — streamed via a fresh read stream per attempt (replayable).
    if (typeof file === 'string') {
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) {
        throw new Api2ConvertError(`Input file not found: ${file}`);
      }
      // Null-coalesce: only `undefined` falls back to the default; "" is preserved.
      const name = filename ?? basename(file);
      const boundary = makeBoundary();
      return {
        makeBody: () => manualMultipart(boundary, name, createReadStream(file)),
        replayable: true,
        contentType: `multipart/form-data; boundary=${boundary}`,
      };
    }

    // In-memory bytes / Blob — replayable FormData body (undici sets the boundary).
    if (file instanceof Uint8Array) {
      const name = filename ?? 'file';
      const blob = new Blob([file]);
      return { makeBody: () => formDataBody(blob, name), replayable: true };
    }
    if (file instanceof Blob) {
      const name = filename ?? 'file';
      return { makeBody: () => formDataBody(file, name), replayable: true };
    }

    // Node Readable / web ReadableStream — one-shot streamed multipart (sent once).
    if (file instanceof Readable) {
      const name = filename ?? 'file';
      const boundary = makeBoundary();
      return {
        makeBody: () => manualMultipart(boundary, name, file),
        replayable: false,
        contentType: `multipart/form-data; boundary=${boundary}`,
      };
    }
    if (file instanceof ReadableStream) {
      const name = filename ?? 'file';
      const boundary = makeBoundary();
      return {
        makeBody: () => manualMultipart(boundary, name, Readable.fromWeb(file)),
        replayable: false,
        contentType: `multipart/form-data; boundary=${boundary}`,
      };
    }

    throw new Api2ConvertError('Unsupported upload input type.');
  }
}

function formDataBody(blob: Blob, filename: string): FormData {
  const form = new FormData();
  form.append('file', blob, filename);
  return form;
}

/**
 * Build a streamed `multipart/form-data` body by hand (avoids buffering a large
 * stream into memory). The filename is embedded in a `Content-Disposition` header,
 * so CR/LF and quotes are stripped to prevent header injection — the bytes
 * themselves are never altered.
 */
function manualMultipart(
  boundary: string,
  filename: string,
  fileStream: Readable,
): ReadableStream<Uint8Array> {
  const safe = filename.replace(/[\r\n"]/g, '');
  const preamble =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safe}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`;
  const epilogue = `\r\n--${boundary}--\r\n`;

  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield Buffer.from(preamble, 'utf8');
    for await (const chunk of fileStream as AsyncIterable<Uint8Array>) {
      yield chunk;
    }
    yield Buffer.from(epilogue, 'utf8');
  }

  return Readable.toWeb(Readable.from(chunks())) as ReadableStream<Uint8Array>;
}

function makeBoundary(): string {
  return '----A2CFormBoundary' + randomBytes(16).toString('hex');
}

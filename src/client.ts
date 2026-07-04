/**
 * The API2Convert client — convert, compress and transform files with one call.
 *
 * `convert()` hides the multi-step job lifecycle (create -> upload -> start ->
 * poll -> download). For full control, use `client.jobs()` and the other resources.
 */

import { createConfig, type Api2ConvertOptions } from './config.js';
import type { AsyncOptions, ConvertInput, ConvertOptions } from './convertOptions.js';
import { Api2ConvertError } from './errors.js';
import type { Job } from './models/job.js';
import type { OutputFile } from './models/outputFile.js';
import {
  ContractsResource,
  ConversionsResource,
  JobsResource,
  PresetsResource,
  StatsResource,
} from './resources/index.js';
import { ConversionResult, FileDownload } from './result.js';
import { FetchHttpSender } from './transport/fetchHttpSender.js';
import { Transport } from './transport/transport.js';
import { FileUploader } from './upload/fileUploader.js';
import { VERSION } from './version.js';
import { WebhookVerifier } from './webhook.js';

const URL_RE = /^https?:\/\//i;

/**
 * API2Convert client.
 *
 * Quick start:
 * ```ts
 * const client = new Api2Convert('YOUR_API_KEY');
 * await client.convert('invoice.docx', 'pdf').then((r) => r.save('invoice.pdf'));
 * ```
 */
export class Api2Convert {
  static readonly VERSION = VERSION;

  private readonly transport: Transport;
  private readonly _jobs: JobsResource;
  private readonly _conversions: ConversionsResource;
  private readonly _presets: PresetsResource;
  private readonly _stats: StatsResource;
  private readonly _contracts: ContractsResource;

  /**
   * Build the client. `apiKey` falls back to the `API2CONVERT_API_KEY`
   * environment variable when empty. Pass `httpSender` to bring your own transport.
   */
  constructor(apiKey = '', options: Api2ConvertOptions = {}) {
    const resolvedKey = apiKey !== '' ? apiKey : (process.env.API2CONVERT_API_KEY ?? '');
    if (!resolvedKey) {
      throw new Api2ConvertError(
        'No API key provided. Pass it to the constructor or set the ' +
          'API2CONVERT_API_KEY environment variable.',
      );
    }

    const config = createConfig(resolvedKey, options);
    const sender = options.httpSender ?? new FetchHttpSender();
    this.transport = new Transport(sender, config, options.sleeper, options.rng);
    const uploader = new FileUploader(this.transport);
    this._jobs = new JobsResource(this.transport, uploader);
    this._conversions = new ConversionsResource(this.transport);
    this._presets = new PresetsResource(this.transport);
    this._stats = new StatsResource(this.transport);
    this._contracts = new ContractsResource(this.transport);
  }

  /**
   * Convert a file and wait for the result.
   *
   * Hand it a local path, a public URL, or a stream, name the target format, and
   * get back a result you can `save()`. `options` are the target-specific
   * conversion options (discover them via {@link options}). A `downloadPassword`
   * is remembered and applied automatically on download.
   */
  async convert(
    input: ConvertInput,
    to: string,
    options: Record<string, unknown> | null = null,
    opts: ConvertOptions = {},
  ): Promise<ConversionResult> {
    const job = await this.startConversion(
      input,
      to,
      options,
      opts.category,
      undefined,
      opts.filename,
      opts.downloadPassword,
    );
    const done = await this._jobs.wait(job.id, opts.timeout);
    return new ConversionResult(done, this.transport, opts.outputIndex ?? 0, opts.downloadPassword);
  }

  /**
   * Start a conversion without waiting.
   *
   * Pass a `callback` URL to be notified (sets `notify_status`), or poll later
   * with `client.jobs().get(job.id)` / `client.jobs().wait(job.id)`.
   */
  async convertAsync(
    input: ConvertInput,
    to: string,
    options: Record<string, unknown> | null = null,
    opts: AsyncOptions = {},
  ): Promise<Job> {
    return this.startConversion(
      input,
      to,
      options,
      opts.category,
      opts.callback,
      opts.filename,
      opts.downloadPassword,
    );
  }

  /**
   * A {@link FileDownload} for an output file. A `downloadPassword` is remembered
   * and sent automatically on download (overridable per call). No I/O happens
   * until `save()` / `contents()` is awaited.
   */
  download(output: OutputFile, downloadPassword?: string): FileDownload {
    return new FileDownload(this.transport, output, downloadPassword);
  }

  /** Discover the valid options (type / enum / default / range) for a target. */
  async options(target: string, category?: string): Promise<Record<string, unknown>> {
    return this._conversions.options(target, category);
  }

  jobs(): JobsResource {
    return this._jobs;
  }

  conversions(): ConversionsResource {
    return this._conversions;
  }

  presets(): PresetsResource {
    return this._presets;
  }

  stats(): StatsResource {
    return this._stats;
  }

  contracts(): ContractsResource {
    return this._contracts;
  }

  /** Webhook verifier — usable without a configured client. */
  static webhooks(): WebhookVerifier {
    return new WebhookVerifier();
  }

  /** Best-effort close of the underlying transport (no-op for the fetch sender). */
  async close(): Promise<void> {
    await this.transport.close();
  }

  private async startConversion(
    input: ConvertInput,
    to: string,
    options: Record<string, unknown> | null,
    category: string | undefined,
    callback: string | undefined,
    filename: string | undefined,
    downloadPassword: string | undefined,
  ): Promise<Job> {
    const conversion: Record<string, unknown> = { target: to };
    if (category !== undefined) conversion.category = category;
    if (options && Object.keys(options).length > 0) conversion.options = { ...options };

    const payload: Record<string, unknown> = { conversion: [conversion] };
    if (callback !== undefined) {
      payload.callback = callback;
      payload.notify_status = true;
    }
    if (downloadPassword !== undefined) {
      payload.download_passwords = [downloadPassword];
    }

    if (typeof input === 'string' && URL_RE.test(input)) {
      payload.process = true;
      payload.input = [{ type: 'remote', source: input }];
      return this._jobs.create(payload);
    }

    payload.process = false;
    const created = await this._jobs.create(payload);
    await this._jobs.upload(created, input, filename);
    return this._jobs.start(created.id);
  }
}

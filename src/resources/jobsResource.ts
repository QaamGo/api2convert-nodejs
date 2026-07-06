/**
 * Full control over the job lifecycle.
 *
 * Most users only need `client.convert()`, which is built on these methods. Reach
 * for this resource for compound jobs, merges, presets, custom polling or job
 * chaining. Methods are thin: build the request, call the transport, hydrate a model.
 */

import { MAX_POLL_TIMEOUT, MIN_POLL_INTERVAL } from '../config.js';
import type { ConvertInput } from '../convertOptions.js';
import { ConversionFailedError, ConversionTimeoutError } from '../errors.js';
import { inputFileFromDict, type InputFile } from '../models/inputFile.js';
import { jobFromDict, type Job } from '../models/job.js';
import { outputFileFromDict, type OutputFile } from '../models/outputFile.js';
import { asList, asObject, isObject } from '../support/data.js';
import type { Transport } from '../transport/transport.js';
import type { FileUploader } from '../upload/fileUploader.js';

export class JobsResource {
  private readonly transport: Transport;
  private readonly uploader: FileUploader;

  constructor(transport: Transport, uploader: FileUploader) {
    this.transport = transport;
    this.uploader = uploader;
  }

  /**
   * Create a job. Pass `{ process: false }` to stage it for uploads, then call
   * {@link start} once inputs are attached. `idempotencyKey` makes the create
   * retry-safe (sent as the `Idempotency-Key` header).
   */
  async create(payload: Record<string, unknown>, idempotencyKey?: string): Promise<Job> {
    const headers =
      idempotencyKey !== undefined ? { 'Idempotency-Key': idempotencyKey } : undefined;
    return jobFromDict(
      asObject(await this.transport.request('POST', '/jobs', payload, undefined, headers)),
    );
  }

  async get(jobId: string): Promise<Job> {
    return jobFromDict(
      asObject(await this.transport.request('GET', `/jobs/${encodeURIComponent(jobId)}`)),
    );
  }

  /** List the current key's jobs (paginated, 50 per page). */
  async list(status?: string, page = 1): Promise<Job[]> {
    const query: Record<string, string> = { page: String(page) };
    if (status !== undefined) query.status = status;
    const rows = await this.transport.request('GET', '/jobs', undefined, query);
    return asList(rows)
      .filter(isObject)
      .map((row) => jobFromDict(row));
  }

  async update(jobId: string, payload: Record<string, unknown>): Promise<Job> {
    return jobFromDict(
      asObject(
        await this.transport.request('PATCH', `/jobs/${encodeURIComponent(jobId)}`, payload),
      ),
    );
  }

  /** Start processing a staged job (`process: true`). */
  async start(jobId: string): Promise<Job> {
    return this.update(jobId, { process: true });
  }

  /** Cancel a job (whether staged or processing). */
  async cancel(jobId: string): Promise<void> {
    await this.transport.request('DELETE', `/jobs/${encodeURIComponent(jobId)}`);
  }

  /**
   * Attach an input by descriptor, e.g. a remote URL:
   * `addInput(jobId, { type: 'remote', source: 'https://...' })`.
   */
  async addInput(jobId: string, descriptor: Record<string, unknown>): Promise<InputFile> {
    return inputFileFromDict(
      asObject(
        await this.transport.request(
          'POST',
          `/jobs/${encodeURIComponent(jobId)}/input`,
          descriptor,
        ),
      ),
    );
  }

  /** Upload a local file (path, bytes or stream) to the job's upload server. */
  async upload(job: Job, file: ConvertInput, filename?: string): Promise<InputFile> {
    return this.uploader.upload(job, file, filename);
  }

  /**
   * Poll with backoff until the job reaches a terminal status.
   *
   * Raises {@link ConversionFailedError} on a failed/canceled job (unless
   * `throwOnFailure` is `false`) and {@link ConversionTimeoutError} past the
   * deadline. The interval is floored and the total wait capped, so no
   * configuration can busy-loop or poll unbounded.
   */
  async wait(jobId: string, timeoutSeconds?: number, throwOnFailure = true): Promise<Job> {
    const config = this.transport.config;
    // Clamp again here (createConfig already clamps) so a per-call override can
    // never busy-loop or poll unbounded.
    const timeout = Math.min(MAX_POLL_TIMEOUT, Math.max(0, timeoutSeconds ?? config.pollTimeout));
    const maxInterval = Math.max(MIN_POLL_INTERVAL, config.pollMaxInterval);
    let interval = Math.max(MIN_POLL_INTERVAL, config.pollInterval);
    const deadline = performance.now() + timeout * 1000;

    for (;;) {
      const job = await this.get(jobId);

      if ((job.isFailed || job.isCanceled) && throwOnFailure) {
        throw new ConversionFailedError(job);
      }
      if (job.isTerminal) return job;
      if (performance.now() >= deadline) throw new ConversionTimeoutError(job, timeout);

      await this.transport.pause(interval);
      interval = Math.min(maxInterval, interval * 1.5);
    }
  }

  /** Outputs produced by the job (use {@link get} or {@link wait} first). */
  async outputs(jobId: string): Promise<OutputFile[]> {
    const rows = await this.transport.request('GET', `/jobs/${encodeURIComponent(jobId)}/output`);
    return asList(rows)
      .filter(isObject)
      .map((row) => outputFileFromDict(row));
  }
}

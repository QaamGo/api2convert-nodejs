/**
 * An in-memory {@link HttpSender} for offline unit tests — the Node analog of the
 * Java `FakeHttpSender` / Python `MockAPI`. Holds a FIFO queue of canned responses
 * and records every outgoing request (method, URL, headers, redirect policy, body).
 */

import type { HttpRequest, HttpResponse, HttpSender } from '../../src/transport/httpSender.js';

const ENC = new TextEncoder();
const DEC = new TextDecoder();

const REASONS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

export class RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly followRedirects: boolean;
  readonly replayable: boolean;
  readonly bodyText: string | undefined;
  readonly hasStreamingBody: boolean;

  constructor(request: HttpRequest) {
    this.method = request.method;
    this.url = request.url;
    this.headers = { ...request.headers };
    this.followRedirects = request.followRedirects;
    this.replayable = request.replayable;
    this.hasStreamingBody = request.makeBody !== undefined;
    if (typeof request.body === 'string') this.bodyText = request.body;
    else if (request.body instanceof Uint8Array) this.bodyText = DEC.decode(request.body);
    else this.bodyText = undefined;
  }

  /** Case-insensitive header lookup; `null` when absent. */
  header(name: string): string | null {
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(this.headers)) {
      if (key.toLowerCase() === lower) return value;
    }
    return null;
  }

  /** Parse the recorded request body as JSON. */
  json(): unknown {
    return JSON.parse(this.bodyText ?? 'null');
  }
}

export class FakeResponse implements HttpResponse {
  readonly status: number;
  readonly statusText: string;
  private readonly headersMap: Map<string, string>;
  private readonly buf: Uint8Array;

  constructor(
    status: number,
    buf: Uint8Array,
    headers: Record<string, string> = {},
    statusText?: string,
  ) {
    this.status = status;
    this.statusText = statusText ?? REASONS[status] ?? '';
    this.buf = buf;
    this.headersMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  }

  header(name: string): string | null {
    return this.headersMap.get(name.toLowerCase()) ?? null;
  }

  bytes(): Promise<Uint8Array> {
    return Promise.resolve(this.buf);
  }

  async *stream(): AsyncIterable<Uint8Array> {
    await Promise.resolve();
    yield this.buf;
  }

  discard(): Promise<void> {
    return Promise.resolve();
  }
}

type Queued = { kind: 'response'; response: FakeResponse } | { kind: 'error'; error: unknown };

export class FakeHttpSender implements HttpSender {
  readonly requests: RecordedRequest[] = [];
  private readonly queue: Queued[] = [];

  addJson(status: number, body: unknown, headers?: Record<string, string>): this {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    this.queue.push({
      kind: 'response',
      response: new FakeResponse(status, ENC.encode(text), headers),
    });
    return this;
  }

  addRaw(status: number, bytes: Uint8Array, headers?: Record<string, string>): this {
    this.queue.push({ kind: 'response', response: new FakeResponse(status, bytes, headers) });
    return this;
  }

  /** Queue a raw text response (default 200); handy for non-JSON success tests. */
  addText(status: number, text: string, headers?: Record<string, string>): this {
    this.queue.push({
      kind: 'response',
      response: new FakeResponse(status, ENC.encode(text), headers),
    });
    return this;
  }

  /** Queue a thrown transport error (network failure) for the next send. */
  addError(error: unknown): this {
    this.queue.push({ kind: 'error', error });
    return this;
  }

  send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(new RecordedRequest(request));
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error(`FakeHttpSender: no queued response for ${request.method} ${request.url}`);
    }
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- simulates arbitrary transport failures
    if (next.kind === 'error') return Promise.reject(next.error);
    return Promise.resolve(next.response);
  }

  /** The last request recorded (throws if none). */
  last(): RecordedRequest {
    const req = this.requests.at(-1);
    if (req === undefined) throw new Error('FakeHttpSender: no requests recorded');
    return req;
  }

  at(index: number): RecordedRequest {
    const req = this.requests[index];
    if (req === undefined) throw new Error(`FakeHttpSender: no request at index ${String(index)}`);
    return req;
  }
}

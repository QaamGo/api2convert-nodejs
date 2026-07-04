/**
 * The default HTTP sender, backed by the global `fetch` (undici on Node 18+).
 *
 * This is the one file allowed to opt a request into following redirects — the
 * load-bearing security boundary. `fetch` follows redirects by default, and
 * undici forwards custom `X-Oc-*` headers across a cross-origin redirect (the
 * Fetch spec only strips `Authorization`/`Cookie`), so a secret-bearing request
 * must be sent with `redirect: 'manual'`. `'manual'` returns an opaque redirect
 * (`status 0`, empty body) — undici never opens a connection to the target, so
 * the account key / upload token / download password can never leak there. Only
 * a no-secret download opts into `redirect: 'follow'` (storage URLs redirect).
 */

import { NetworkError } from '../errors.js';
import type { FetchBody, FetchInit, HttpRequest, HttpResponse, HttpSender } from './httpSender.js';

/** A `fetch`-compatible function; override to bring your own transport/agent. */
export type FetchLike = typeof fetch;

type RequestInitWithDuplex = FetchInit & { duplex?: 'half' };

export class FetchHttpSender implements HttpSender {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    // Validate the URL up front so a malformed API-supplied URI surfaces as a
    // (non-retryable) NetworkError, not a raw TypeError from URL parsing.
    let url: URL;
    try {
      url = new URL(request.url);
    } catch (cause) {
      throw new NetworkError(`Invalid request URL: ${request.url}`, { cause });
    }

    const body: FetchBody | undefined = request.makeBody ? request.makeBody() : request.body;

    const init: RequestInitWithDuplex = {
      method: request.method,
      headers: request.headers,
      redirect: request.followRedirects ? 'follow' : 'manual',
      signal: AbortSignal.timeout(request.timeoutMs),
    };
    if (body !== undefined) {
      init.body = body;
      // undici requires half-duplex when the request body is a stream.
      if (body instanceof ReadableStream) {
        init.duplex = 'half';
      }
    }

    // A genuine transport failure (DNS / connection / TLS / timeout) is re-thrown
    // as-is so the Transport treats it as transient and may retry it.
    const response = await this.fetchImpl(url, init);
    return new FetchResponse(response);
  }
}

class FetchResponse implements HttpResponse {
  readonly status: number;
  readonly statusText: string;

  constructor(private readonly response: Response) {
    this.status = response.status;
    this.statusText = response.statusText;
  }

  header(name: string): string | null {
    return this.response.headers.get(name);
  }

  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(await this.response.arrayBuffer());
  }

  async *stream(): AsyncIterable<Uint8Array> {
    const body = this.response.body;
    if (!body) return;
    const reader = body.getReader();
    try {
      for (;;) {
        const chunk = (await reader.read()) as { done: boolean; value: Uint8Array | undefined };
        if (chunk.done) break;
        if (chunk.value) yield chunk.value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  async discard(): Promise<void> {
    try {
      await this.response.body?.cancel();
    } catch {
      // Best-effort; nothing actionable if the body is already gone.
    }
  }
}

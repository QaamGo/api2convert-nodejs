/**
 * Real loopback HTTP servers for the independent security suite — the Node analog
 * of Java `SecurityTest`'s `com.sun.net.httpserver` servers. Only real servers can
 * prove the *transport* does not forward `X-Oc-*` secret headers across a
 * cross-host redirect (a mocked sender short-circuits the redirect entirely).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

export interface LoopbackServer {
  readonly url: string;
  readonly port: number;
  /** Total requests received by this server. */
  hits(): number;
  /** Every request's headers, in order. */
  headersReceived(): IncomingMessage['headers'][];
  close(): Promise<void>;
}

/**
 * Start a loopback server on `127.0.0.1:0`. Every request bumps a hit counter and
 * its headers are recorded before `handler` is invoked to produce the response.
 */
export async function startServer(handler: Handler): Promise<LoopbackServer> {
  let hits = 0;
  const headers: IncomingMessage['headers'][] = [];

  const server = createServer((req, res) => {
    hits += 1;
    headers.push(req.headers);
    handler(req, res);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${String(port)}`,
    port,
    hits: () => hits,
    headersReceived: () => headers,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

/** Respond with a status + text body. */
export function respond(res: ServerResponse, status: number, body = ''): void {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(body);
}

/** Respond with a cross-host redirect to `location`. */
export function redirectTo(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

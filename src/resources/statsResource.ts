/**
 * API usage statistics. The response shape is free-form (returned as-is).
 *
 * `filter` is either an API key to scope to, or `all`.
 */

import type { Transport } from '../transport/transport.js';

export class StatsResource {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /** `day` format `yyyy-mm-dd`. */
  async day(day: string, filter = 'all'): Promise<unknown> {
    return this.transport.request(
      'GET',
      `/stats/day/${encodeURIComponent(day)}/${encodeURIComponent(filter)}`,
    );
  }

  /** `month` format `yyyy-mm`. */
  async month(month: string, filter = 'all'): Promise<unknown> {
    return this.transport.request(
      'GET',
      `/stats/month/${encodeURIComponent(month)}/${encodeURIComponent(filter)}`,
    );
  }

  /** `year` format `yyyy`. */
  async year(year: string, filter = 'all'): Promise<unknown> {
    return this.transport.request(
      'GET',
      `/stats/year/${encodeURIComponent(year)}/${encodeURIComponent(filter)}`,
    );
  }
}

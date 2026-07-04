/**
 * The conversions catalog (`GET /conversions`).
 *
 * The source of truth for which targets exist and which options each accepts.
 */

import { asList, asObject, isObject, type JsonObject } from '../support/data.js';
import type { Transport } from '../transport/transport.js';

export class ConversionsResource {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /**
   * List supported conversions, optionally filtered by category/target. Each
   * entry: `{ id, category, target, options }`.
   */
  async list(category?: string, target?: string, page = 1): Promise<JsonObject[]> {
    const query: Record<string, string> = { page: String(page) };
    if (category !== undefined) query.category = category;
    if (target !== undefined) query.target = target;
    const rows = await this.transport.request('GET', '/conversions', undefined, query);
    return asList(rows).filter(isObject);
  }

  /**
   * The option schema (type / enum / default / range) for a single target.
   *
   * `category` is optional — pass it only to disambiguate an ambiguous target.
   */
  async options(target: string, category?: string): Promise<JsonObject> {
    const rows = await this.list(category, target);
    const first = rows[0] ?? {};
    return asObject(first.options);
  }
}

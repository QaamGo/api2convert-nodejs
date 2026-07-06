/** Saved conversion presets (reusable named target + options). */

import { presetFromDict, type Preset } from '../models/preset.js';
import { asList, asObject, isObject } from '../support/data.js';
import type { Transport } from '../transport/transport.js';

export class PresetsResource {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async list(category?: string, target?: string, filter?: string): Promise<Preset[]> {
    const query: Record<string, string> = {};
    if (category !== undefined) query.category = category;
    if (target !== undefined) query.target = target;
    if (filter !== undefined) query.filter = filter;
    const rows = await this.transport.request('GET', '/presets', undefined, query);
    return asList(rows)
      .filter(isObject)
      .map((row) => presetFromDict(row));
  }

  /** Create a preset from `{ name, target, options, scope?, category? }`. */
  async create(payload: Record<string, unknown>): Promise<Preset> {
    return presetFromDict(asObject(await this.transport.request('POST', '/presets', payload)));
  }

  async get(presetId: string): Promise<Preset> {
    return presetFromDict(
      asObject(await this.transport.request('GET', `/presets/${encodeURIComponent(presetId)}`)),
    );
  }

  async update(presetId: string, payload: Record<string, unknown>): Promise<Preset> {
    return presetFromDict(
      asObject(
        await this.transport.request('PATCH', `/presets/${encodeURIComponent(presetId)}`, payload),
      ),
    );
  }

  async delete(presetId: string): Promise<void> {
    await this.transport.request('DELETE', `/presets/${encodeURIComponent(presetId)}`);
  }
}

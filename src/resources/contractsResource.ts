/** Information about the account's active contracts (free-form response). */

import type { Transport } from '../transport/transport.js';

export class ContractsResource {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async get(): Promise<unknown> {
    return this.transport.request('GET', '/contracts');
  }
}

import { describe, expect, it } from 'vitest';

import { MIN_POLL_INTERVAL } from '../../src/index.js';
import { makeClient } from '../helpers/testClient.js';

describe('polling guards', () => {
  it('floors the poll interval so a zero interval cannot busy-loop', async () => {
    const { client, http, slept } = makeClient({ pollInterval: 0, pollMaxInterval: 10 });
    http
      .addJson(200, { status: { code: 'processing' } })
      .addJson(200, { status: { code: 'completed' } });

    await client.jobs().wait('j');

    expect(slept.length).toBe(1);
    expect(slept[0]).toBeGreaterThanOrEqual(MIN_POLL_INTERVAL);
  });

  it('backs the interval off by 1.5x up to the configured maximum', async () => {
    const { client, http, slept } = makeClient({ pollInterval: 1, pollMaxInterval: 2 });
    for (let i = 0; i < 4; i += 1) http.addJson(200, { status: { code: 'processing' } });
    http.addJson(200, { status: { code: 'completed' } });

    await client.jobs().wait('j');

    // 1 -> 1.5 -> 2 (capped) -> 2 ; rng()=0 so no jitter is added on top.
    expect(slept).toEqual([1, 1.5, 2, 2]);
  });
});

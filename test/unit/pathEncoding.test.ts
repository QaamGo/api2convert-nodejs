import { describe, expect, it } from 'vitest';

import { makeClient } from '../helpers/testClient.js';

// A dynamic path segment (job/preset id, stats date/filter) that, if interpolated
// raw, would inject extra path segments or a query/fragment into the request URL.
const HOSTILE = 'a/b?c#d';
const ENCODED = 'a%2Fb%3Fc%23d';

describe('path segment encoding', () => {
  it('percent-encodes special characters in a job id path segment', async () => {
    const { client, http } = makeClient();
    http.addJson(200, { id: 'x', status: { code: 'completed' } });
    await client.jobs().get(HOSTILE);
    expect(http.last().url).toContain(`/jobs/${ENCODED}`);
    expect(http.last().url).not.toContain(HOSTILE);
  });

  it('percent-encodes a preset id path segment', async () => {
    const { client, http } = makeClient();
    http.addJson(200, { id: 'x' });
    await client.presets().get(HOSTILE);
    expect(http.last().url).toContain(`/presets/${ENCODED}`);
    expect(http.last().url).not.toContain(HOSTILE);
  });

  it('percent-encodes both the stats date and filter path segments', async () => {
    const { client, http } = makeClient();
    http.addJson(200, {});
    await client.stats().day('2026-01-01', HOSTILE);
    expect(http.last().url).toContain(`/stats/day/2026-01-01/${ENCODED}`);
    expect(http.last().url).not.toContain(HOSTILE);
  });
});

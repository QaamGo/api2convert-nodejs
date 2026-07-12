/**
 * Cloud-connector parity fixtures 1 (create-payload serialization) and 2 (read hydration),
 * plus the unit behaviour of the new cloud types. The JSON shapes and assertions mirror the
 * canonical fixtures shared across every SDK.
 */

import { describe, expect, it } from 'vitest';

import { CloudProvider } from '../../src/enums/cloudProvider.js';
import { CloudInput } from '../../src/models/cloudInput.js';
import { jobFromDict } from '../../src/models/job.js';
import { OutputTarget } from '../../src/models/outputTarget.js';
import { makeClient } from '../helpers/testClient.js';

/** The exact input descriptor fixture 1 expects the SDK to serialize. */
const EXPECTED_INPUT = {
  type: 'cloud',
  source: 'amazons3',
  parameters: { bucket: 'my-bucket', file: 'in/photo.png' },
  credentials: { accesskeyid: 'AKIA_TEST', secretaccesskey: 'SECRET_TEST' },
};

/** The exact output_target descriptor fixture 1 expects — note: no `status` key. */
const EXPECTED_OUTPUT_TARGET = {
  type: 'ftp',
  parameters: { host: 'ftp.example.com', file: '/out/photo.jpg' },
  credentials: { username: 'u', password: 'p' },
};

describe('Fixture 1 — create-payload (what convert() serializes)', () => {
  it('serializes a cloud input and output target on the convert() outputTargets control', async () => {
    const { client, http } = makeClient();
    // create -> started job; wait() polls once to a completed job with no local output.
    http
      .addJson(201, { id: 'job-1', status: { code: 'incomplete' } })
      .addJson(200, { id: 'job-1', status: { code: 'completed' } });

    const input = CloudInput.amazonS3('my-bucket', 'in/photo.png', 'AKIA_TEST', 'SECRET_TEST');
    const target = new OutputTarget(
      'ftp',
      { host: 'ftp.example.com', file: '/out/photo.jpg' },
      { username: 'u', password: 'p' },
    );

    await client.convert(input, 'jpg', null, { outputTargets: [target] });

    const body = http.at(0).json() as Record<string, unknown>;

    // 1) a cloud input is a started job (like a remote URL), not staged/uploaded.
    expect(body.process).toBe(true);

    // 2) input[0] carries the flat/lowercase keys exactly as the factory emits them.
    expect(body.input).toEqual([EXPECTED_INPUT]);

    // 3) conversion[0].output_target[0] serializes {type,parameters,credentials} and NO status.
    const conversions = body.conversion as Record<string, unknown>[];
    expect(conversions[0]?.output_target).toEqual([EXPECTED_OUTPUT_TARGET]);
    const targets = conversions[0]?.output_target as Record<string, unknown>[];
    expect(targets[0]).not.toHaveProperty('status');

    // output targets never leak into the conversion options map.
    expect(conversions[0]).not.toHaveProperty('options');
  });

  it('produces a byte-identical output_target via the raw jobs().create conversion map', async () => {
    const { client, http } = makeClient();
    http.addJson(201, { id: 'job-1', status: { code: 'completed' } });

    await client.jobs().create({
      process: true,
      input: [
        CloudInput.amazonS3('my-bucket', 'in/photo.png', 'AKIA_TEST', 'SECRET_TEST').toDict(),
      ],
      conversion: [
        {
          target: 'jpg',
          output_target: [
            OutputTarget.of(
              CloudProvider.Ftp,
              { host: 'ftp.example.com', file: '/out/photo.jpg' },
              { username: 'u', password: 'p' },
            ).toDict(),
          ],
        },
      ],
    });

    const body = http.at(0).json() as Record<string, unknown>;
    // Both the convert() outputTargets control and the raw create map yield the same shape.
    expect(body.input).toEqual([EXPECTED_INPUT]);
    const conversions = body.conversion as Record<string, unknown>[];
    expect(conversions[0]?.output_target).toEqual([EXPECTED_OUTPUT_TARGET]);
  });

  it('accepts a CloudInput builder on jobs().addInput', async () => {
    const { client, http } = makeClient();
    http.addJson(200, { id: 'in-1', type: 'cloud', source: 'ftp' });

    await client.jobs().addInput('job-1', CloudInput.ftp('ftp.example.com', 'in/a.png', 'u', 'p'));

    const body = http.at(0).json() as Record<string, unknown>;
    expect(body.type).toBe('cloud');
    expect(body.source).toBe('ftp');
    expect(body.parameters).toEqual({ host: 'ftp.example.com', file: 'in/a.png' });
    expect(body.credentials).toEqual({ username: 'u', password: 'p' });
  });
});

describe('Fixture 2 — read hydration (a GET /jobs/{id} response)', () => {
  it('hydrates a cloud input and output target from a canned response', () => {
    const job = jobFromDict({
      id: 'job-1',
      status: { code: 'completed' },
      input: [
        {
          id: 'in-1',
          type: 'cloud',
          source: 'amazons3',
          status: 'ready',
          parameters: { bucket: 'my-bucket', file: 'in/photo.png' },
          credentials: {},
        },
      ],
      conversion: [
        {
          id: 'c-1',
          target: 'jpg',
          output_target: [
            {
              type: 'ftp',
              parameters: { host: 'ftp.example.com', file: '/out/photo.jpg' },
              credentials: {},
              status: 'uploading',
            },
          ],
        },
      ],
    });

    // 1) input source is a RAW string; parameters surface.
    const input = job.input[0];
    expect(input?.source).toBe('amazons3');
    expect(input?.status).toBe('ready');
    expect(input?.parameters).toEqual({ bucket: 'my-bucket', file: 'in/photo.png' });

    // 2) output target status/parameters/type surface.
    const out = job.conversion[0]?.outputTargets[0];
    expect(out?.type).toBe('ftp');
    expect(out?.status).toBe('uploading');
    expect(out?.parameters).toEqual({ host: 'ftp.example.com', file: '/out/photo.jpg' });

    // 3) credentials are never surfaced (the API returns them empty; the SDK does not hydrate).
    expect(out?.credentials).toEqual({});
  });

  it('round-trips an unknown provider string without throwing', () => {
    const job = jobFromDict({
      id: 'job-1',
      status: { code: 'completed' },
      input: [{ id: 'in-1', type: 'cloud', source: 'r2', status: 'ready' }],
      conversion: [{ target: 'jpg', output_target: [{ type: 'r2', status: 'waiting' }] }],
    });

    expect(job.input[0]?.source).toBe('r2');
    expect(job.conversion[0]?.outputTargets[0]?.type).toBe('r2');
    expect(job.conversion[0]?.outputTargets[0]?.status).toBe('waiting');
  });
});

describe('the new cloud value types', () => {
  it('exposes the six-provider vocabulary, build-side only', () => {
    expect(Object.values(CloudProvider)).toEqual([
      'amazons3',
      'azure',
      'ftp',
      'gdrive',
      'googlecloud',
      'youtube',
    ]);
  });

  it('carries each provider factory’s required keys verbatim (flat/lowercase)', () => {
    expect(CloudInput.azure('c', 'f', 'n', 'k').toDict()).toEqual({
      type: 'cloud',
      source: 'azure',
      parameters: { container: 'c', file: 'f' },
      credentials: { accountname: 'n', accountkey: 'k' },
    });
    expect(CloudInput.googleCloud('p', 'b', 'f', 'kf').toDict()).toEqual({
      type: 'cloud',
      source: 'googlecloud',
      parameters: { projectid: 'p', bucket: 'b', file: 'f' },
      credentials: { keyfile: 'kf' },
    });
  });

  it('merges forward-compat keys through the trailing maps', () => {
    const input = CloudInput.amazonS3(
      'b',
      'f',
      'id',
      'sec',
      { region: 'eu' },
      { sessiontoken: 't' },
    );
    expect(input.parameters).toEqual({ bucket: 'b', file: 'f', region: 'eu' });
    expect(input.credentials).toEqual({
      accesskeyid: 'id',
      secretaccesskey: 'sec',
      sessiontoken: 't',
    });
  });

  it('omits status on serialize but hydrates it on read', () => {
    const created = new OutputTarget('ftp', { host: 'h' }, { username: 'u' }, 'completed');
    expect(created.toDict()).not.toHaveProperty('status');

    const read = OutputTarget.of('ftp');
    expect(read.status).toBeNull();
  });
});

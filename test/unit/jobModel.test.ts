import { describe, expect, it } from 'vitest';

import { jobFromDict } from '../../src/index.js';

describe('Job hydration', () => {
  it('hydrates a full payload', () => {
    const job = jobFromDict({
      id: 'job-1',
      token: 'tok',
      server: 'https://up.example/v2',
      status: { code: 'completed', info: 'done' },
      conversion: [{ target: 'png', options: { quality: 90 } }],
      input: [{ id: 'in-1', type: 'upload', size: '1234', content_type: 'image/jpeg' }],
      output: [{ id: 'out-1', uri: 'https://dl/x.png', filename: 'x.png', size: 4096 }],
      warnings: [{ code: 10, message: 'heads up', id_source: 'conversion_0' }],
      errors: [],
    });

    expect(job.id).toBe('job-1');
    expect(job.token).toBe('tok');
    expect(job.status.code).toBe('completed');
    expect(job.status.info).toBe('done');
    expect(job.conversion[0]?.target).toBe('png');
    expect(job.conversion[0]?.options).toEqual({ quality: 90 });
    expect(job.input[0]?.size).toBe(1234); // "1234" coerced
    expect(job.input[0]?.contentType).toBe('image/jpeg');
    expect(job.output[0]?.size).toBe(4096);
    expect(job.warnings[0]?.idSource).toBe('conversion_0');
    expect(job.isCompleted).toBe(true);
    expect(job.isTerminal).toBe(true);
  });

  it('treats an unknown status code as non-terminal, non-completed', () => {
    const job = jobFromDict({ id: 'j', status: { code: 'warp-speed' } });
    expect(job.isCompleted).toBe(false);
    expect(job.isFailed).toBe(false);
    expect(job.isTerminal).toBe(false);
  });

  it('detects each terminal state', () => {
    expect(jobFromDict({ status: { code: 'failed' } }).isFailed).toBe(true);
    expect(jobFromDict({ status: { code: 'canceled' } }).isCanceled).toBe(true);
    expect(jobFromDict({ status: { code: 'failed' } }).isTerminal).toBe(true);
    expect(jobFromDict({ status: { code: 'canceled' } }).isTerminal).toBe(true);
  });

  it('never throws on a surprising / partial payload', () => {
    const job = jobFromDict({ id: 42, status: 'nope', output: 'nope', token: 123 });
    expect(job.id).toBe('');
    expect(job.status.code).toBe('');
    expect(job.output).toEqual([]);
    expect(job.token).toBeNull();
  });

  it('preserves the full decoded response in raw', () => {
    const job = jobFromDict({ id: 'j', extra_future_field: { nested: true } });
    expect(job.raw.extra_future_field).toEqual({ nested: true });
  });
});

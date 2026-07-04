import { describe, expect, it } from 'vitest';

import { Api2Convert, SignatureVerificationError, webhooks } from '../../src/index.js';
import { sign } from '../helpers/testClient.js';

const SECRET = 'whsec_test';
const PAYLOAD = JSON.stringify({ id: 'job-1', status: { code: 'completed' } });

describe('webhook verification', () => {
  it('is usable without a configured client (static + module-level)', () => {
    expect(typeof Api2Convert.webhooks().parse).toBe('function');
    expect(typeof webhooks().parse).toBe('function');
  });

  it('verifies a valid signature and returns the typed event', () => {
    const event = Api2Convert.webhooks().constructEvent(PAYLOAD, sign(PAYLOAD, SECRET), SECRET);
    expect(event.job.id).toBe('job-1');
    expect(event.job.isCompleted).toBe(true);
    expect(event.payload).toMatchObject({ id: 'job-1' });
  });

  it('rejects a tampered payload', () => {
    const goodSig = sign(PAYLOAD, SECRET);
    expect(() => Api2Convert.webhooks().constructEvent(PAYLOAD + ' ', goodSig, SECRET)).toThrow(
      SignatureVerificationError,
    );
  });

  it('rejects a missing signature when a secret is given', () => {
    expect(() => Api2Convert.webhooks().constructEvent(PAYLOAD, null, SECRET)).toThrow(
      /Missing webhook signature/,
    );
    expect(() => Api2Convert.webhooks().constructEvent(PAYLOAD, '', SECRET)).toThrow(
      SignatureVerificationError,
    );
  });

  it('skips verification when the secret is empty', () => {
    const event = Api2Convert.webhooks().constructEvent(PAYLOAD, null, '');
    expect(event.job.id).toBe('job-1');
  });

  it('accepts a raw Buffer body', () => {
    const buf = Buffer.from(PAYLOAD, 'utf8');
    const event = Api2Convert.webhooks().constructEvent(buf, sign(PAYLOAD, SECRET), SECRET);
    expect(event.job.id).toBe('job-1');
  });

  it('rejects invalid JSON and non-object JSON', () => {
    expect(() => Api2Convert.webhooks().parse('{not json')).toThrow(/not valid JSON/);
    expect(() => Api2Convert.webhooks().parse('123')).toThrow(/not a JSON object/);
  });
});

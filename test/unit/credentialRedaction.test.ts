/**
 * Cloud-connector fixture 3 — the credential redaction / isolation suite.
 *
 * The single secret `SUPERSECRET123` must never appear on any rendering/error path, and the fixed
 * marker `[REDACTED]` must appear where a credentials object is rendered.
 */

import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { CloudProvider } from '../../src/enums/cloudProvider.js';
import { ValidationError } from '../../src/errors.js';
import { CloudInput } from '../../src/models/cloudInput.js';
import { OutputTarget } from '../../src/models/outputTarget.js';
import { makeClient } from '../helpers/testClient.js';

const SECRET = 'SUPERSECRET123';
const MARKER = '[REDACTED]';

/** Render an object through both the util.inspect and the toString inspection paths. */
function renderings(value: CloudInput | OutputTarget): string[] {
  return [inspect(value), String(value)];
}

describe('3a — object rendering masks credentials', () => {
  it('masks a CloudInput’s credentials on every inspection path', () => {
    const input = CloudInput.amazonS3('b', 'f', 'AKIA', SECRET);
    for (const rendered of renderings(input)) {
      expect(rendered).not.toContain(SECRET);
      expect(rendered).toContain(MARKER);
      // Non-secret parameters still render.
      expect(rendered).toContain('"bucket":"b"');
    }
  });

  it('masks an OutputTarget’s credentials', () => {
    const target = OutputTarget.of(
      CloudProvider.Ftp,
      { host: 'ftp.example.com' },
      { username: 'u', password: SECRET },
    );
    for (const rendered of renderings(target)) {
      expect(rendered).not.toContain(SECRET);
      expect(rendered).toContain(MARKER);
    }
  });
});

describe('3b + 3c — error text and error-body deep-walk', () => {
  it('never leaks the submitted credential on the create-path error', async () => {
    const { client, http } = makeClient({ maxRetries: 0 });
    // A 422 whose decoded body echoes the submitted secret in a nested/dotted key (belt-and-
    // suspenders: the real API echoes field *names* only). The convert() request body itself
    // carried the secret in credentials — it must not surface on the exception either.
    http.addJson(422, {
      message: 'Validation failed',
      errors: { 'input.0.credentials.secretaccesskey': SECRET },
    });

    const err = (await client
      .convert(CloudInput.amazonS3('b', 'f', 'AKIA', SECRET), 'jpg')
      .catch((e: unknown) => e)) as ValidationError;

    expect(err).toBeInstanceOf(ValidationError);
    // 3b: no secret in the message.
    expect(err.message).not.toContain(SECRET);
    expect(err.stack ?? '').not.toContain(SECRET);
    // 3c: the deep-walk masks the echoed secret to the marker.
    const body = JSON.stringify(err.body);
    expect(body).not.toContain(SECRET);
    expect(body).toContain(MARKER);
  });
});

describe('3d — sensitive parameters leaf', () => {
  it('masks a sensitive parameters key while leaving non-secret keys intact', () => {
    const input = CloudInput.of(CloudProvider.AmazonS3, { token: 'PARAMSECRET', bucket: 'b' });
    for (const rendered of renderings(input)) {
      expect(rendered).not.toContain('PARAMSECRET');
      expect(rendered).toContain(MARKER);
      // A non-secret key renders normally.
      expect(rendered).toContain('"bucket":"b"');
    }
  });
});

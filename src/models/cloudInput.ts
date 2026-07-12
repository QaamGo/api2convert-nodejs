/**
 * A cloud-storage input descriptor: `{ type:"cloud", source:<provider>, parameters, credentials }`.
 *
 * Hand it to `client.convert()` / `convertAsync()` as the input, or to
 * `client.jobs().addInput(jobId, cloudInput)`; either way it emits the wire descriptor via
 * {@link CloudInput.toDict}. Like a remote URL, a cloud input is a **started** job
 * (`process: true`), not a staged upload.
 *
 * The per-provider named constructors carry each provider's required keys **verbatim** — flat
 * and lowercase, exactly as the API expects (`accesskeyid`, not `accessKeyId`). The required
 * keys are constructor arguments (structural correctness), **not** a runtime gate: the builder
 * never rejects a descriptor the permissive, asynchronously-validating server would accept.
 * Optional and forward-compat keys go through the trailing `parameters` / `credentials` maps,
 * or the generic {@link CloudInput.of} escape hatch.
 *
 * Google Drive *input* uses the `gdrive_picker` input type (the generic `addInput` raw-map path
 * this wave); `gdrive`/`youtube` are output-only.
 *
 * `credentials` ride in the plaintext body, so both the `util.inspect` and `toString` paths mask
 * the **whole** credentials object to `[REDACTED]` and any sensitive `parameters` leaf.
 */

import { inspect } from 'node:util';

import { CloudProvider } from '../enums/cloudProvider.js';
import { InputType } from '../enums/inputType.js';
import type { JsonObject } from '../support/data.js';
import { REDACTION_MARKER, redactParameters } from '../support/redactor.js';

export class CloudInput {
  /** The provider string (a {@link CloudProvider} value, or a forward-compat string). */
  readonly source: string;
  /** Non-secret locator keys (`bucket`, `file`, `host`, …). */
  readonly parameters: JsonObject;
  /** Secret keys (access keys, passwords, tokens) — never surfaced by inspection. */
  readonly credentials: JsonObject;

  constructor(
    source: CloudProvider | string,
    parameters: JsonObject = {},
    credentials: JsonObject = {},
  ) {
    this.source = source;
    this.parameters = parameters;
    this.credentials = credentials;
  }

  /** Generic escape hatch: any provider (typed or a forward-compat string) with free-form maps. */
  static of(
    source: CloudProvider | string,
    parameters: JsonObject = {},
    credentials: JsonObject = {},
  ): CloudInput {
    return new CloudInput(source, parameters, credentials);
  }

  /**
   * Import from Amazon S3. Extra `parameters` (e.g. `region`) and `credentials` (e.g. a
   * `sessiontoken`) are merged in after the required keys.
   */
  static amazonS3(
    bucket: string,
    file: string,
    accesskeyid: string,
    secretaccesskey: string,
    parameters: JsonObject = {},
    credentials: JsonObject = {},
  ): CloudInput {
    return new CloudInput(
      CloudProvider.AmazonS3,
      { bucket, file, ...parameters },
      { accesskeyid, secretaccesskey, ...credentials },
    );
  }

  /** Import from Azure Blob Storage. */
  static azure(
    container: string,
    file: string,
    accountname: string,
    accountkey: string,
    parameters: JsonObject = {},
    credentials: JsonObject = {},
  ): CloudInput {
    return new CloudInput(
      CloudProvider.Azure,
      { container, file, ...parameters },
      { accountname, accountkey, ...credentials },
    );
  }

  /** Import from an FTP server. */
  static ftp(
    host: string,
    file: string,
    username: string,
    password: string,
    parameters: JsonObject = {},
    credentials: JsonObject = {},
  ): CloudInput {
    return new CloudInput(
      CloudProvider.Ftp,
      { host, file, ...parameters },
      { username, password, ...credentials },
    );
  }

  /** Import from Google Cloud Storage. */
  static googleCloud(
    projectid: string,
    bucket: string,
    file: string,
    keyfile: string,
    parameters: JsonObject = {},
    credentials: JsonObject = {},
  ): CloudInput {
    return new CloudInput(
      CloudProvider.GoogleCloud,
      { projectid, bucket, file, ...parameters },
      { keyfile, ...credentials },
    );
  }

  /**
   * The wire descriptor sent to `POST /jobs` (inline `input`) or `POST /jobs/{id}/input`.
   */
  toDict(): JsonObject {
    return {
      type: InputType.Cloud,
      source: this.source,
      parameters: this.parameters,
      credentials: this.credentials,
    };
  }

  /**
   * Human-readable form with credentials masked — safe to log. The whole `credentials` object
   * renders as `[REDACTED]`; sensitive `parameters` leaves are masked too.
   */
  toString(): string {
    return (
      `CloudInput(type=cloud, source=${this.source}, ` +
      `parameters=${JSON.stringify(redactParameters(this.parameters))}, ` +
      `credentials=${REDACTION_MARKER})`
    );
  }

  /** `util.inspect` / `console.log` render the same masked form. */
  [inspect.custom](): string {
    return this.toString();
  }
}

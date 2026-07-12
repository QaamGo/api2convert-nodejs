/**
 * Official Node.js/TypeScript SDK for the API2Convert file-conversion API.
 *
 * ```ts
 * import { Api2Convert } from '@api2convert/sdk';
 *
 * const client = new Api2Convert('YOUR_API_KEY');
 * const result = await client.convert('invoice.docx', 'pdf');
 * await result.save('invoice.pdf');
 * ```
 */

export { Api2Convert } from './client.js';
export { VERSION } from './version.js';

export type { Api2ConvertOptions, Config } from './config.js';
export { createConfig, DEFAULT_BASE_URL, MAX_POLL_TIMEOUT, MIN_POLL_INTERVAL } from './config.js';
export type { AsyncOptions, ConvertInput, ConvertOptions } from './convertOptions.js';

export { ConversionResult, FileDownload } from './result.js';
export { WebhookVerifier, type WebhookEvent } from './webhook.js';

export {
  ConversionsResource,
  ContractsResource,
  JobsResource,
  PresetsResource,
  StatsResource,
} from './resources/index.js';

// Models (readonly interfaces + hydration factories).
export type { Status } from './models/status.js';
export type { Conversion } from './models/conversion.js';
export type { InputFile } from './models/inputFile.js';
export type { OutputFile } from './models/outputFile.js';
export type { JobMessage } from './models/jobMessage.js';
export type { Preset } from './models/preset.js';
export type { Job } from './models/job.js';
export {
  conversionFromDict,
  inputFileFromDict,
  jobFromDict,
  jobMessageFromDict,
  outputFileFromDict,
  outputFileOf,
  presetFromDict,
  statusFromDict,
} from './models/index.js';

// Cloud connectors (build-side vocabulary + descriptors).
export { CloudInput } from './models/cloudInput.js';
export { OutputTarget, outputTargetFromDict } from './models/outputTarget.js';

// Enums.
export { JobStatus, isTerminalCode } from './enums/jobStatus.js';
export { InputType } from './enums/inputType.js';
export { CloudProvider } from './enums/cloudProvider.js';

// Errors.
export {
  Api2ConvertError,
  ApiError,
  AuthenticationError,
  ConversionFailedError,
  ConversionTimeoutError,
  NetworkError,
  NotFoundError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
  SignatureVerificationError,
  ValidationError,
} from './errors.js';
export type { ApiErrorOptions } from './errors.js';

// Transport seam (advanced: bring your own sender).
export type { FetchLike } from './transport/fetchHttpSender.js';
export { FetchHttpSender } from './transport/fetchHttpSender.js';
export type {
  HttpRequest,
  HttpResponse,
  HttpSender,
  Rng,
  Sleeper,
} from './transport/httpSender.js';

import { WebhookVerifier } from './webhook.js';

/** Webhook verifier — usable without a configured client (module-level convenience). */
export function webhooks(): WebhookVerifier {
  return new WebhookVerifier();
}

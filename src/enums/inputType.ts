/**
 * The kinds of source an input file can be created from (the input `type` field).
 *
 * A typed reference for building input descriptors by hand, e.g.
 * `addInput(jobId, { type: InputType.Remote, source: '...' })`.
 */
export enum InputType {
  Upload = 'upload',
  Remote = 'remote',
  Output = 'output',
  InputId = 'input_id',
  GdrivePicker = 'gdrive_picker',
  Base64 = 'base64',
  Cloud = 'cloud',
}

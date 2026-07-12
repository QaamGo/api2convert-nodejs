/**
 * The cloud storage providers the API can import inputs from and deliver outputs to
 * — the values of a cloud descriptor's `source` (input) / `type` (output) field.
 *
 * This is **build-side vocabulary only**: it types the {@link CloudInput} builder and
 * {@link OutputTarget} serialization. Read models keep `source`/`type`/`status` as raw
 * strings, so an unknown provider string returned by the server round-trips untyped and
 * never throws — hydration never parses this enum.
 *
 * Import support (a `CloudInput` factory) exists for {@link CloudProvider.AmazonS3},
 * {@link CloudProvider.Azure}, {@link CloudProvider.Ftp} and {@link CloudProvider.GoogleCloud}.
 * {@link CloudProvider.Gdrive} and {@link CloudProvider.Youtube} are **output-only** (they
 * validate as an output `type` but have no downloader); Google Drive *input* uses the
 * separate `gdrive_picker` input type.
 */
export enum CloudProvider {
  AmazonS3 = 'amazons3',
  Azure = 'azure',
  Ftp = 'ftp',
  Gdrive = 'gdrive',
  GoogleCloud = 'googlecloud',
  Youtube = 'youtube',
}

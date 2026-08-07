/**
 * Small string helpers shared across the SDK. Internal, not part of the public API.
 */

/**
 * Strip every trailing character contained in `chars` from `value`.
 *
 * Deliberately a scan rather than a regex: `/\/+$/` and friends backtrack, so a
 * string ending in a long run of separators costs O(n²) to match (CodeQL's
 * `js/polynomial-redos`). `job.server` arrives from the API and `baseUrl` from
 * caller config, so neither is worth a quadratic path. This is a single reverse
 * scan — O(n), no backtracking, identical result.
 */
export function trimTrailing(value: string, chars: string): string {
  let end = value.length;
  // charAt (not indexing) returns string rather than string | undefined, which keeps
  // both @typescript-eslint/no-non-null-assertion and non-nullable-type-assertion-style
  // satisfied — they forbid the two obvious ways to narrow an indexed access.
  while (end > 0 && chars.includes(value.charAt(end - 1))) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

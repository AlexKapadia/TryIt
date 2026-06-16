/**
 * @tryit/api/_lib/bearer — extract the bearer token from an Authorization header.
 *
 * Pulls the plaintext API key out of `Authorization: Bearer <token>`, fail-closed: a missing
 * header, a non-Bearer scheme, or an empty token yields `null` so the caller refuses with
 * UNAUTHORIZED rather than proceeding with an empty credential.
 */

/** Return the bearer token, or `null` when absent/malformed (fail-closed). */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header === null) {
    return null; // fail-closed: no credential presented.
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match === null) {
    return null; // fail-closed: wrong scheme or no token.
  }
  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
}

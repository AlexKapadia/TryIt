/**
 * @tryit/engine/providers/deterministic_placeholder_svg — reproducible placeholder image.
 *
 * Builds a deterministic SVG composite from a request's stable hash. The output is purely a
 * function of the digest, so identical requests yield a byte-identical image. The SVG is used
 * as the visible artefact behind the deterministic provider's result; it never touches the
 * network and pulls colours/shapes solely from the digest's hex nibbles.
 */

/** Derive two hex-driven accent colours from the digest so the swatch varies per request. */
function coloursFromDigest(digest: string): { primary: string; secondary: string } {
  // Slice fixed windows of the 16-char hex digest into 6-char CSS colours; pad defensively.
  const primary = `#${(digest.slice(0, 6) + '000000').slice(0, 6)}`;
  const secondary = `#${(digest.slice(6, 12) + '000000').slice(0, 6)}`;
  return { primary, secondary };
}

/**
 * Render the deterministic placeholder SVG for a digest.
 *
 * @returns A self-contained SVG document string. Same digest -> identical bytes, always.
 */
export function buildPlaceholderSvg(digest: string): string {
  const { primary, secondary } = coloursFromDigest(digest);
  // A fixed 512x640 portrait canvas (try-on aspect) with two digest-driven bands plus the
  // digest printed as a label so the placeholder is visually traceable to its request.
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640" viewBox="0 0 512 640">',
    `<rect width="512" height="640" fill="${primary}"/>`,
    `<rect y="320" width="512" height="320" fill="${secondary}"/>`,
    '<text x="256" y="600" font-family="monospace" font-size="20" fill="#ffffff" ' +
      `text-anchor="middle">tryit:${digest}</text>`,
    '</svg>',
  ].join('');
}

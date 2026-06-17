/**
 * Mutation-hardening tests for the deterministic placeholder SVG. The happy-path suite only
 * checked loose substrings ("<svg", "tryit:"), so 15 mutants survived. These pin the EXACT
 * bytes for known digests so every literal/slice mutant is observable:
 *  - colour derivation (L14/L15/L16): exact primary/secondary hex, including the `+'000000'`
 *    padding for short digests and the `#` prefix.
 *  - the SVG document parts (L30-L35): exact rect fills, text attributes, and `tryit:<digest>` label.
 *  - the base64 wrapping (L40): the data URL round-trips back to the exact SVG bytes.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPlaceholderSvg,
  buildPlaceholderImageDataUrl,
} from './deterministic_placeholder_svg.js';

/** Reconstruct the expected SVG for a digest, independently of the implementation under test. */
function expectedSvg(digest: string): string {
  const primary = `#${(digest.slice(0, 6) + '000000').slice(0, 6)}`;
  const secondary = `#${(digest.slice(6, 12) + '000000').slice(0, 6)}`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640" viewBox="0 0 512 640">',
    `<rect width="512" height="640" fill="${primary}"/>`,
    `<rect y="320" width="512" height="320" fill="${secondary}"/>`,
    '<text x="256" y="600" font-family="monospace" font-size="20" fill="#ffffff" ' +
      `text-anchor="middle">tryit:${digest}</text>`,
    '</svg>',
  ].join('');
}

describe('buildPlaceholderSvg (mutation-hardening)', () => {
  it('emits byte-exact SVG for a full 16-char digest (kills colour + SVG-part mutants)', () => {
    const digest = '0123456789abcdef';
    const svg = buildPlaceholderSvg(digest);
    // Exact primary/secondary windows: 012345 and 6789ab. Any slice/pad mutant changes these.
    expect(svg).toContain('<rect width="512" height="640" fill="#012345"/>');
    expect(svg).toContain('<rect y="320" width="512" height="320" fill="#6789ab"/>');
    expect(svg).toContain('>tryit:0123456789abcdef</text>');
    expect(svg).toBe(expectedSvg(digest));
  });

  it('pads a SHORT digest with 000000 (kills the `+ "000000"` slice-pad mutants)', () => {
    // 'abc' -> primary '#abc000' (pad applied), secondary '#000000' (entirely from the pad).
    const svg = buildPlaceholderSvg('abc');
    expect(svg).toContain('fill="#abc000"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toBe(expectedSvg('abc'));
  });

  it('pins the exact text attributes and the tryit: label prefix (kills the text-part mutants)', () => {
    const svg = buildPlaceholderSvg('deadbeefcafe1234');
    expect(svg).toContain(
      '<text x="256" y="600" font-family="monospace" font-size="20" fill="#ffffff" text-anchor="middle">tryit:deadbeefcafe1234</text>',
    );
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });
});

describe('buildPlaceholderImageDataUrl (mutation-hardening)', () => {
  it('base64-wraps the EXACT svg bytes so it round-trips (kills the "base64" literal mutant)', () => {
    const digest = '0123456789abcdef';
    const url = buildPlaceholderImageDataUrl(digest);
    const prefix = 'data:image/svg+xml;base64,';
    expect(url.startsWith(prefix)).toBe(true);
    const decoded = Buffer.from(url.slice(prefix.length), 'base64').toString('utf-8');
    // A blanked encoding ('' instead of 'base64') would not decode back to the SVG bytes.
    expect(decoded).toBe(expectedSvg(digest));
  });
});

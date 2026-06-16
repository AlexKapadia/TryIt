/**
 * Tests for image-ref normalisation: https URLs pass through; base64 refs become data URIs with
 * the correct MIME prefix; and the exhaustive switch fails closed on an unknown discriminant.
 */

import { describe, expect, it } from 'vitest';
import type { ImageRef } from '@tryit/contracts';
import { imageRefToInput } from './image_ref_to_input.js';

describe('imageRefToInput', () => {
  it('passes an https url ref through unchanged', () => {
    const ref: ImageRef = { kind: 'url', url: 'https://cdn.example.com/p.jpg' };
    expect(imageRefToInput(ref)).toBe('https://cdn.example.com/p.jpg');
  });

  it('encodes a base64 ref as a data URI carrying its MIME type', () => {
    const ref: ImageRef = { kind: 'base64', mimeType: 'image/png', data: 'QUJD' };
    expect(imageRefToInput(ref)).toBe('data:image/png;base64,QUJD');
  });

  it('fails closed on an unrecognised discriminant', () => {
    // Force an invalid shape past the type system to exercise the fail-closed branch.
    const rogue = { kind: 'gopher', data: 'x' } as unknown as ImageRef;
    expect(() => imageRefToInput(rogue)).toThrow(/unsupported image reference kind/);
  });
});

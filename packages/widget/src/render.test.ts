/**
 * Tests for the pure render functions. They assert real ARIA roles/labels and the presence of
 * the right interactive controls (not just "it renders"), and that the error view is total over
 * the seven codes. No element/state-machine involvement — render functions are pure.
 */

import { describe, it, expect } from 'vitest';
import {
  renderLauncher,
  renderConsent,
  renderUpload,
  renderUploading,
  renderProcessing,
  renderResult,
  renderError,
} from './render.js';
import { ErrorCodeSchema, type ErrorCode } from '@tryit/contracts';
import type { StagedPhoto } from './state.js';
import { presentationForCode } from './error-copy.js';

const photo: StagedPhoto = {
  fileName: 'me.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1000,
  previewUrl: 'blob:preview',
};

/** Helper: query an action control inside a rendered tree. */
function action(node: HTMLElement, name: string): HTMLElement | null {
  return node.querySelector<HTMLElement>(`[data-action="${name}"]`);
}

describe('renderLauncher', () => {
  it('is a button with an accessible name and dialog popup semantics', () => {
    const l = renderLauncher();
    expect(l.tagName).toBe('BUTTON');
    expect(l.getAttribute('aria-label')).toBe('Try it on with a photo');
    expect(l.getAttribute('aria-haspopup')).toBe('dialog');
    expect(l.getAttribute('data-action')).toBe('open');
  });
});

describe('renderConsent — first-class screen, equal-weight buttons', () => {
  it('renders a labelled modal dialog', () => {
    const c = renderConsent();
    const dialog = c.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('ti-consent-title');
    expect(c.querySelector('#ti-consent-title')!.textContent).toContain('Before you upload');
  });

  it('has both accept AND decline as real buttons (no dark-pattern omission)', () => {
    const c = renderConsent();
    expect(action(c, 'consent-accept')).not.toBeNull();
    expect(action(c, 'consent-decline')).not.toBeNull();
  });

  it('states what/why/how-long including never-train and never-share', () => {
    const text = renderConsent().textContent ?? '';
    expect(text).toContain('one photo');
    expect(text).toContain('train AI');
    expect(text).toContain('never share');
  });

  it('does NOT contain any file input (cannot upload from consent)', () => {
    expect(renderConsent().querySelector('input[type="file"]')).toBeNull();
  });
});

describe('renderUpload', () => {
  it('has a real file input restricted to the allowed image types', () => {
    const u = renderUpload(undefined);
    const input = u.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
    expect(input.getAttribute('data-action')).toBe('file-choose');
  });

  it('disables the submit button when no photo is staged', () => {
    const submit = action(renderUpload(undefined), 'submit')!;
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(submit.hasAttribute('disabled')).toBe(true);
  });

  it('enables submit and shows the preview img with alt text when a photo is staged', () => {
    const u = renderUpload(photo);
    const submit = action(u, 'submit')!;
    expect(submit.hasAttribute('disabled')).toBe(false);
    const preview = u.querySelector<HTMLImageElement>('[data-preview="true"]')!;
    expect(preview.getAttribute('src')).toBe('blob:preview');
    expect(preview.getAttribute('alt')).toBe('Your uploaded photo');
  });

  it('includes framing guidance wired via aria-describedby', () => {
    const u = renderUpload(undefined);
    const input = u.querySelector<HTMLInputElement>('input[type="file"]')!;
    const described = input.getAttribute('aria-describedby')!;
    expect(u.querySelector(`#${described}`)!.textContent).toContain('full-length');
  });
});

describe('renderUploading / renderProcessing — honest async waits', () => {
  it('uploading announces via a polite live region', () => {
    const status = renderUploading().querySelector('[role="status"]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('processing shows an honest ETA and a hidden skeleton with a text status', () => {
    const p = renderProcessing();
    expect(p.textContent).toContain('10–20 seconds');
    expect(p.querySelector('.ti-skeleton')!.getAttribute('aria-hidden')).toBe('true');
    expect(p.querySelector('[role="status"]')!.getAttribute('aria-live')).toBe('polite');
  });

  it('processing never shows a fabricated percentage', () => {
    expect(renderProcessing().textContent).not.toMatch(/\d+%/);
  });
});

describe('renderResult — payoff with compare + disclaimer', () => {
  it('renders the result image with a descriptive alt and the AI disclaimer', () => {
    const r = renderResult('https://cdn/result.png', photo);
    const img = r.querySelector<HTMLImageElement>('[data-result="true"]')!;
    expect(img.getAttribute('src')).toBe('https://cdn/result.png');
    expect(img.getAttribute('alt')).toContain('Preview of you wearing');
    expect(r.textContent).toContain('AI preview');
  });

  it('exposes add-to-cart and try-another as real controls', () => {
    const r = renderResult('https://cdn/result.png', photo);
    expect(action(r, 'add-to-cart')).not.toBeNull();
    expect(action(r, 'retry')).not.toBeNull();
  });

  it('renders an accessible compare slider when a before photo exists', () => {
    const slider = renderResult('https://cdn/r.png', photo).querySelector('[role="slider"]')!;
    expect(slider.getAttribute('aria-valuenow')).toBe('50');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
    expect(slider.getAttribute('aria-label')).toContain('Compare');
  });

  it('omits the compare slider when there is no before photo', () => {
    expect(renderResult('https://cdn/r.png', undefined).querySelector('[role="slider"]')).toBeNull();
  });
});

describe('renderError — total over the 7 codes', () => {
  const codes = ErrorCodeSchema.options as readonly ErrorCode[];

  it.each(codes)('%s -> alert region with the mapped message + recovery control', (code) => {
    const view = renderError(code);
    const alert = view.querySelector('[role="alert"]')!;
    expect(alert.getAttribute('aria-live')).toBe('assertive');
    const p = presentationForCode(code);
    expect(view.textContent).toContain(p.message);
    expect(alert.getAttribute('data-tone')).toBe(p.tone);
    // The recovery control lives in the actions row (the sheet '×' close is separate chrome
    // that also carries data-action="close"; scope the lookup so we test the recovery button).
    const actionsRow = view.querySelector('.ti-actions')!;
    const recovery = actionsRow.querySelector<HTMLElement>(`[data-action="${p.recovery}"]`)!;
    expect(recovery).not.toBeNull();
    expect(recovery.textContent).toBe(p.recoveryLabel);
  });

  it('is never color-only: every error carries an icon glyph + text', () => {
    for (const code of codes) {
      const view = renderError(code);
      const icon = view.querySelector('.ti-error-icon')!;
      expect((icon.textContent ?? '').length).toBeGreaterThan(0);
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

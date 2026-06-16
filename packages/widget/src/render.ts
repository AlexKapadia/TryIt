/**
 * @tryit/widget/render — pure render functions, one per widget state.
 *
 * Each function takes plain data and returns a DOM node, with NO dependency on the custom
 * element, the state machine, or the network — so every screen is unit-testable in jsdom by
 * calling the function directly and asserting on the returned tree (roles, labels, controls).
 *
 * Accessibility is built in, not bolted on: the sheet is `role="dialog" aria-modal="true"`,
 * status regions are `aria-live`, errors announce `assertive`, the result image has a
 * descriptive alt, the compare control is a real `role="slider"`, and every interactive
 * affordance is a real focusable control with an accessible name.
 */

import type { StagedPhoto } from './state.js';
import type { ErrorCode } from '@tryit/contracts';
import { presentationForCode } from './error-copy.js';
import { el, button } from './dom.js';

/** Build the floating launcher button injected onto the host page. */
export function renderLauncher(): HTMLButtonElement {
  // Accessible name describes the action + that a photo is involved (component-inventory §1).
  return button('open', 'Try it on', {
    class: 'ti-launcher',
    attrs: {
      'aria-haspopup': 'dialog',
      'aria-label': 'Try it on with a photo',
    },
  });
}

/** Wrap a screen's body in the dialog sheet shell with a close control and a title for labelling. */
export function renderSheet(titleId: string, body: Node): HTMLElement {
  const close = button('close', '×', {
    class: 'ti-close',
    attrs: { 'aria-label': 'Close try-on' },
  });
  const sheet = el(
    'div',
    {
      class: 'ti-sheet',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    },
    [close, body],
  );
  return el('div', { class: 'ti-overlay', attrs: { 'data-action-overlay': 'true' } }, [sheet]);
}

/** The consent gate: plain-language what/why/how-long with equal-weight accept/decline. */
export function renderConsent(): HTMLElement {
  const title = el('h2', {
    class: 'ti-title',
    text: 'Before you upload a photo',
    attrs: { id: 'ti-consent-title' },
  });
  const list = el('ul', { class: 'ti-list' }, [
    el('li', { text: "We'll use one photo of you to create a try-on preview." }),
    el('li', { text: 'So you can see how this item looks on you before buying.' }),
    el('li', {
      text: 'Your photo is used only for this preview, then deleted. We never use it to train AI, and we never share it.',
    }),
  ]);
  // Equal visual weight: accept is primary, decline is a real, prominent secondary (no dark pattern).
  const accept = button('consent-accept', 'I agree — continue', { class: 'ti-btn ti-btn-primary' });
  const decline = button('consent-decline', 'Not now', { class: 'ti-btn ti-btn-secondary' });
  const actions = el('div', { class: 'ti-actions' }, [decline, accept]);
  const body = el('div', {}, [title, list, actions]);
  return renderSheet('ti-consent-title', body);
}

/** The upload dropzone. Reaches DOM only after consent (the element gates this) — privacy. */
export function renderUpload(photo: StagedPhoto | undefined): HTMLElement {
  const title = el('h2', {
    class: 'ti-title',
    text: 'Add your photo',
    attrs: { id: 'ti-upload-title' },
  });
  const input = el('input', {
    class: 'ti-file-input',
    attrs: {
      type: 'file',
      id: 'ti-file',
      accept: 'image/jpeg,image/png,image/webp',
      'data-action': 'file-choose',
      'aria-describedby': 'ti-upload-guidance',
    },
  });
  const label = el('label', { attrs: { for: 'ti-file' } }, [
    el('span', { text: 'Drag a photo here, or ' }),
    el('strong', { text: 'choose a file' }),
  ]);
  const guidance = el('p', {
    class: 'ti-caption',
    attrs: { id: 'ti-upload-guidance' },
    text: 'A clear, full-length photo with good light and a plain background works best. Avoid other people. Fitted clothing fits best.',
  });
  const zone = el(
    'div',
    { class: 'ti-dropzone', attrs: { 'data-dropzone': 'true', 'data-dragover': 'false' } },
    [input, label, guidance],
  );

  const children: Node[] = [title, zone];
  if (photo !== undefined) {
    const preview = el('img', {
      attrs: { src: photo.previewUrl, alt: 'Your uploaded photo', 'data-preview': 'true' },
    });
    children.push(preview);
  }
  // Primary action enables only when a photo is staged (component-inventory §4 ✓).
  const submit = button('submit', 'Try it on', {
    class: 'ti-btn ti-btn-primary',
    attrs: photo === undefined ? { disabled: 'true', 'aria-disabled': 'true' } : {},
  });
  children.push(el('div', { class: 'ti-actions' }, [submit]));
  return renderSheet('ti-upload-title', el('div', {}, children));
}

/** Transient uploading state shown while the create-job request is in flight. */
export function renderUploading(): HTMLElement {
  const title = el('h2', {
    class: 'ti-title',
    text: 'Uploading your photo',
    attrs: { id: 'ti-uploading-title' },
  });
  const status = el('p', {
    class: 'ti-body',
    text: 'Sending your photo securely…',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  return renderSheet('ti-uploading-title', el('div', {}, [title, status]));
}

/** Processing skeleton with an honest ETA and a polite live status (no fake percentage). */
export function renderProcessing(): HTMLElement {
  const title = el('h2', {
    class: 'ti-title',
    text: 'Creating your preview',
    attrs: { id: 'ti-processing-title' },
  });
  // Skeleton mirrors the result frame; hidden from AT, which reads the live status instead.
  const skeleton = el('div', { class: 'ti-skeleton', attrs: { 'aria-hidden': 'true' } });
  const eta = el('p', {
    class: 'ti-body',
    text: 'This usually takes about 10–20 seconds.',
  });
  const reassurance = el('p', {
    class: 'ti-caption',
    text: 'Your photo is being used only for this preview.',
  });
  const status = el('p', {
    class: 'ti-caption',
    text: 'Creating your preview',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  return renderSheet(
    'ti-processing-title',
    el('div', {}, [title, skeleton, eta, reassurance, status]),
  );
}

/** Result viewer with a before/after compare slider and the honest AI disclaimer. */
export function renderResult(resultUrl: string, photo: StagedPhoto | undefined): HTMLElement {
  const heading = el('h2', {
    class: 'ti-display',
    text: "Here's your fit",
    attrs: { id: 'ti-result-title' },
  });
  const result = el('img', {
    class: 'ti-result-img',
    attrs: { src: resultUrl, alt: 'Preview of you wearing this item', 'data-result': 'true' },
  });
  const frame = el('div', { class: 'ti-result-frame' }, [result]);

  const compareChildren: Node[] = [frame];
  if (photo !== undefined) {
    const before = el('img', {
      attrs: { src: photo.previewUrl, alt: 'Your original photo', 'data-before': 'true' },
    });
    // Real slider semantics: arrow keys move the divider (component-inventory §8 A11y).
    const slider = el('input', {
      class: 'ti-compare-slider',
      attrs: {
        type: 'range',
        min: '0',
        max: '100',
        value: '50',
        role: 'slider',
        'aria-label': 'Compare before and after',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': '50',
        'data-compare': 'true',
      },
    });
    compareChildren.unshift(before);
    compareChildren.push(slider);
  }
  const compare = el('div', { class: 'ti-compare' }, compareChildren);

  const disclaimer = el('p', {
    class: 'ti-caption',
    text: 'AI preview — fit and details may not be exact.',
  });
  const addToCart = button('add-to-cart', 'Add to cart', { class: 'ti-btn ti-btn-primary' });
  const tryAnother = button('retry', 'Try another photo', { class: 'ti-btn ti-btn-secondary' });
  const actions = el('div', { class: 'ti-actions' }, [tryAnother, addToCart]);
  return renderSheet('ti-result-title', el('div', {}, [heading, compare, disclaimer, actions]));
}

/** Error view, parameterized by the contract error code → friendly copy + recovery. */
export function renderError(code: ErrorCode): HTMLElement {
  const p = presentationForCode(code);
  const title = el('h2', {
    class: 'ti-title',
    text: 'Something went wrong',
    attrs: { id: 'ti-error-title' },
  });
  // Not color-only: an icon glyph + text + tone token together convey the state.
  const icon = el('span', {
    class: 'ti-error-icon',
    attrs: { 'aria-hidden': 'true' },
    text: p.tone === 'danger' ? '!' : '⏳',
  });
  const message = el('p', { class: 'ti-body', text: p.message });
  const recoveryAction = p.recovery === 'retry' ? 'retry' : 'close';
  // The recovery control is the first focusable element and announces assertively.
  const recovery = button(recoveryAction, p.recoveryLabel, { class: 'ti-btn ti-btn-primary' });
  const region = el(
    'div',
    {
      class: 'ti-error',
      attrs: { role: 'alert', 'aria-live': 'assertive', 'data-tone': p.tone },
    },
    [icon, message],
  );
  const body = el('div', {}, [title, region, el('div', { class: 'ti-actions' }, [recovery])]);
  return renderSheet('ti-error-title', body);
}

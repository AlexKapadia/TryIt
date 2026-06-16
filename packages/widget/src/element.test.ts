/**
 * Integration tests for the <tryit-widget> custom element in jsdom. These drive real DOM events
 * (clicks, file change, drop, Escape) and assert the rendered state, the CustomEvents dispatched
 * to the host, the privacy guard (no upload before consent), and the double-define guard.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { TryItWidget, defineTryItWidget, TAG_NAME } from './element.js';
import type { ErrorCode } from '@tryit/contracts';

beforeAll(() => {
  defineTryItWidget();
});

/** Mount a fresh widget into the document and return it. */
function mount(): TryItWidget {
  const elNode = document.createElement(TAG_NAME) as TryItWidget;
  document.body.appendChild(elNode);
  return elNode;
}

/** Click the first control with the given data-action inside the shadow root. */
function click(w: TryItWidget, action: string): void {
  const ctl = w.shadowRoot!.querySelector<HTMLElement>(`[data-action="${action}"]`);
  if (ctl === null) throw new Error(`no control for action ${action}`);
  ctl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** Build a fake File-like object (jsdom File honours type/size from the blob parts/options). */
function makeFile(name: string, type: string, size: number): File {
  const f = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

/** Fire a change on the file input with a chosen file. */
function chooseFile(w: TryItWidget, file: File): void {
  const input = w.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('mount + launcher', () => {
  it('registers the tag and renders the launcher with shadow DOM + injected styles', () => {
    const w = mount();
    expect(customElements.get(TAG_NAME)).toBe(TryItWidget);
    expect(w.shadowRoot).not.toBeNull();
    expect(w.shadowRoot!.querySelector('style')!.textContent).toContain('--ti-accent');
    expect(w.shadowRoot!.querySelector('[data-action="open"]')).not.toBeNull();
    expect(w.currentState.name).toBe('idle');
  });
});

describe('privacy: no file input exists before consent is accepted', () => {
  it('idle and consent screens contain NO file input', () => {
    const w = mount();
    expect(w.shadowRoot!.querySelector('input[type="file"]')).toBeNull(); // idle
    click(w, 'open');
    expect(w.currentState.name).toBe('consent');
    expect(w.shadowRoot!.querySelector('input[type="file"]')).toBeNull(); // consent
  });

  it('declining consent returns to idle with no file input ever appearing', () => {
    const w = mount();
    click(w, 'open');
    click(w, 'consent-decline');
    expect(w.currentState.name).toBe('idle');
    expect(w.shadowRoot!.querySelector('input[type="file"]')).toBeNull();
  });

  it('the file input appears ONLY after accepting consent', () => {
    const w = mount();
    click(w, 'open');
    click(w, 'consent-accept');
    expect(w.currentState.name).toBe('upload');
    expect(w.shadowRoot!.querySelector('input[type="file"]')).not.toBeNull();
  });
});

describe('file validation in the UI', () => {
  function toUpload(): TryItWidget {
    const w = mount();
    click(w, 'open');
    click(w, 'consent-accept');
    return w;
  }

  it('a valid image stages the photo and enables submit', () => {
    const w = toUpload();
    chooseFile(w, makeFile('me.jpg', 'image/jpeg', 1024));
    expect(w.currentState.name).toBe('upload');
    expect(w.currentState.photo?.fileName).toBe('me.jpg');
    const submit = w.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="submit"]')!;
    expect(submit.hasAttribute('disabled')).toBe(false);
  });

  it('an invalid file TYPE is rejected in-UI -> error(INVALID_INPUT), no photo staged', () => {
    const w = toUpload();
    chooseFile(w, makeFile('x.gif', 'image/gif', 1024));
    expect(w.currentState.name).toBe('error');
    expect(w.currentState.errorCode).toBe('INVALID_INPUT');
    expect(w.currentState.photo).toBeUndefined();
  });

  it('an OVERSIZE file is rejected in-UI -> error(PAYLOAD_TOO_LARGE)', () => {
    const w = toUpload();
    chooseFile(w, makeFile('big.png', 'image/png', 9 * 1024 * 1024));
    expect(w.currentState.name).toBe('error');
    expect(w.currentState.errorCode).toBe('PAYLOAD_TOO_LARGE');
  });

  it('a dropped valid file stages it via the dropzone', () => {
    const w = toUpload();
    const zone = w.shadowRoot!.querySelector<HTMLElement>('[data-dropzone="true"]')!;
    const dropEvent = new Event('drop', { bubbles: true }) as DragEvent;
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [makeFile('drop.webp', 'image/webp', 2048)] },
    });
    Object.defineProperty(dropEvent, 'preventDefault', { value: () => {} });
    zone.dispatchEvent(dropEvent);
    expect(w.currentState.photo?.fileName).toBe('drop.webp');
  });
});

describe('async outcomes + host CustomEvents', () => {
  function toProcessing(): TryItWidget {
    const w = mount();
    click(w, 'open');
    click(w, 'consent-accept');
    chooseFile(w, makeFile('me.jpg', 'image/jpeg', 1024));
    click(w, 'submit');
    w.send({ type: 'JOB_CREATED', jobId: 'job-1' });
    return w;
  }

  it('dispatches tryit:result with the resultUrl on success', () => {
    const w = toProcessing();
    const handler = vi.fn();
    w.addEventListener('tryit:result', handler as EventListener);
    w.send({ type: 'JOB_SUCCEEDED', resultUrl: 'https://cdn/r.png' });
    expect(w.currentState.name).toBe('result');
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail.resultUrl).toBe('https://cdn/r.png');
  });

  it('dispatches tryit:error with the code on failure', () => {
    const w = toProcessing();
    const handler = vi.fn();
    w.addEventListener('tryit:error', handler as EventListener);
    w.send({ type: 'JOB_FAILED', errorCode: 'PROVIDER_ERROR' satisfies ErrorCode });
    expect(w.currentState.name).toBe('error');
    const detail = (handler.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail.code).toBe('PROVIDER_ERROR');
  });

  it('dispatches tryit:addtocart from the result screen', () => {
    const w = toProcessing();
    w.send({ type: 'JOB_SUCCEEDED', resultUrl: 'https://cdn/r.png' });
    const handler = vi.fn();
    w.addEventListener('tryit:addtocart', handler as EventListener);
    click(w, 'add-to-cart');
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]![0] as CustomEvent).detail.resultUrl).toBe('https://cdn/r.png');
  });

  it('events bubble and are composed (cross the shadow boundary to the host)', () => {
    const w = toProcessing();
    const hostHandler = vi.fn();
    document.body.addEventListener('tryit:result', hostHandler as EventListener);
    w.send({ type: 'JOB_SUCCEEDED', resultUrl: 'https://cdn/r.png' });
    expect(hostHandler).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('tryit:result', hostHandler as EventListener);
  });
});

describe('retry preserves the staged photo', () => {
  it('error -> retry returns to upload with the photo still staged', () => {
    const w = mount();
    click(w, 'open');
    click(w, 'consent-accept');
    chooseFile(w, makeFile('me.jpg', 'image/jpeg', 1024));
    click(w, 'submit');
    w.send({ type: 'JOB_FAILED', errorCode: 'PROVIDER_ERROR' });
    expect(w.currentState.name).toBe('error');
    click(w, 'retry');
    expect(w.currentState.name).toBe('upload');
    expect(w.currentState.photo?.fileName).toBe('me.jpg');
  });
});

describe('keyboard + close', () => {
  it('Escape closes the sheet back to idle', () => {
    const w = mount();
    click(w, 'open');
    click(w, 'consent-accept');
    const sheet = w.shadowRoot!.querySelector<HTMLElement>('.ti-sheet')!;
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(w.currentState.name).toBe('idle');
  });

  it('Escape on the idle launcher does nothing', () => {
    const w = mount();
    const launcher = w.shadowRoot!.querySelector<HTMLElement>('[data-action="open"]')!;
    launcher.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(w.currentState.name).toBe('idle');
  });
});

describe('defensive UI branches', () => {
  function toUpload(): TryItWidget {
    const w = mount();
    click(w, 'open');
    click(w, 'consent-accept');
    return w;
  }

  it('a file-change event with no file selected is ignored (stays on upload)', () => {
    const w = toUpload();
    const input = w.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(w.currentState.name).toBe('upload');
    expect(w.currentState.photo).toBeUndefined();
  });

  it('a click on a control with an unknown data-action is a no-op', () => {
    const w = toUpload();
    const stray = document.createElement('button');
    stray.setAttribute('data-action', 'totally-unknown');
    w.shadowRoot!.querySelector('.ti-sheet')!.appendChild(stray);
    stray.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(w.currentState.name).toBe('upload');
  });

  it('uses URL.createObjectURL for the preview when available', () => {
    const spy = vi.fn(() => 'blob:made-it');
    const original = (URL as { createObjectURL?: unknown }).createObjectURL;
    (URL as { createObjectURL?: unknown }).createObjectURL = spy;
    try {
      const w = toUpload();
      chooseFile(w, makeFile('me.jpg', 'image/jpeg', 1024));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(w.currentState.photo?.previewUrl).toBe('blob:made-it');
    } finally {
      (URL as { createObjectURL?: unknown }).createObjectURL = original;
    }
  });
});

describe('double-define guard', () => {
  it('calling defineTryItWidget twice does not throw', () => {
    expect(() => {
      defineTryItWidget();
      defineTryItWidget();
    }).not.toThrow();
    expect(customElements.get(TAG_NAME)).toBe(TryItWidget);
  });
});

describe('reduced-motion styling is shipped', () => {
  it('the injected stylesheet contains a prefers-reduced-motion block', () => {
    const w = mount();
    const css = w.shadowRoot!.querySelector('style')!.textContent ?? '';
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none');
  });
});

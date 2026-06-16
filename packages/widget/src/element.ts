/**
 * @tryit/widget/element — the `<tryit-widget>` custom element.
 *
 * This is the only stateful, side-effecting part of the widget. It owns the shadow DOM, holds
 * the pure state machine (`state.ts`), renders the current state (`render.ts`), and wires DOM
 * events to machine events. It performs NO transition logic of its own — every state change
 * goes through `transition()` so the privacy invariant (no upload before consent) is enforced
 * in one tested place.
 *
 * Side-effect boundary: file validation, object-URL creation, network calls, and CustomEvent
 * dispatch all live here; the machine and render functions stay pure. Events emitted for the
 * host page: `tryit:result`, `tryit:error`, `tryit:addtocart`.
 */

import { INITIAL_STATE, transition, type WidgetEvent, type WidgetState } from './state.js';
import {
  renderLauncher,
  renderConsent,
  renderUpload,
  renderUploading,
  renderProcessing,
  renderResult,
  renderError,
} from './render.js';
import { WIDGET_STYLES } from './styles.js';
import { validateChosenFile } from './validate-file.js';

/** The registered tag name for the widget. */
export const TAG_NAME = 'tryit-widget';

/** The custom element implementing the embeddable try-on widget. */
export class TryItWidget extends HTMLElement {
  private state: WidgetState = INITIAL_STATE;
  private readonly root: ShadowRoot;
  private launcherEl: HTMLButtonElement | null = null;

  constructor() {
    super();
    // Closed-by-isolation: the shadow root keeps host styles out and widget styles in.
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    const style = document.createElement('style');
    style.textContent = WIDGET_STYLES;
    this.root.appendChild(style);
    this.render();
  }

  /** Apply an event through the pure machine, then re-render and run any resulting effects. */
  private dispatch(event: WidgetEvent): void {
    const previous = this.state;
    this.state = transition(this.state, event);
    if (this.state !== previous) {
      this.render();
      this.runEntryEffects(previous, this.state);
    }
  }

  /** Render the current state's screen into the shadow root (the style node is preserved). */
  private render(): void {
    // Clear everything except the persistent <style>.
    for (const child of Array.from(this.root.children)) {
      if (child.tagName !== 'STYLE') {
        child.remove();
      }
    }
    const view = this.viewForState();
    this.root.appendChild(view);
    this.wireEvents(view);
  }

  /** Build the DOM tree for the current state (delegates to the pure render functions). */
  private viewForState(): HTMLElement {
    switch (this.state.name) {
      case 'idle':
        this.launcherEl = renderLauncher();
        return this.launcherEl;
      case 'consent':
        return renderConsent();
      case 'upload':
        return renderUpload(this.state.photo);
      case 'uploading':
        return renderUploading();
      case 'processing':
        return renderProcessing();
      case 'result':
        return renderResult(this.state.resultUrl ?? '', this.state.photo);
      case 'error':
        return renderError(this.state.errorCode ?? 'PROVIDER_ERROR');
      default:
        return renderLauncher();
    }
  }

  /** Attach delegated click/change/keydown handlers to the freshly-rendered view. */
  private wireEvents(view: HTMLElement): void {
    view.addEventListener('click', (e) => this.onClick(e));
    view.addEventListener('change', (e) => this.onChange(e));
    view.addEventListener('keydown', (e) => this.onKeydown(e));
    const dropzone = view.querySelector<HTMLElement>('[data-dropzone="true"]');
    if (dropzone !== null) {
      this.wireDropzone(dropzone);
    }
  }

  /** Route a click on any `[data-action]` control to the matching machine event/effect. */
  private onClick(e: Event): void {
    const target = e.target as HTMLElement;
    const control = target.closest<HTMLElement>('[data-action]');
    if (control === null) {
      return;
    }
    const action = control.getAttribute('data-action');
    switch (action) {
      case 'open':
        this.dispatch({ type: 'OPEN' });
        break;
      case 'consent-accept':
        this.dispatch({ type: 'CONSENT_ACCEPT' });
        break;
      case 'consent-decline':
      case 'close':
        this.dispatch({ type: 'CLOSE' });
        break;
      case 'submit':
        this.dispatch({ type: 'SUBMIT' });
        break;
      case 'retry':
        this.dispatch({ type: 'RETRY' });
        break;
      case 'add-to-cart':
        this.emit('tryit:addtocart', { resultUrl: this.state.resultUrl ?? null });
        break;
      default:
        break;
    }
  }

  /** Handle the file input change: validate client-side, then stage or reject. */
  private onChange(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.getAttribute('data-action') !== 'file-choose') {
      return;
    }
    const input = target as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    this.handleFile(file);
  }

  /** Validate a chosen/dropped file and dispatch the corresponding machine event. */
  private handleFile(file: File): void {
    const result = validateChosenFile(file);
    if (!result.ok) {
      // fail-closed: invalid type/oversize never uploads; surfaces the right error state.
      this.dispatch({ type: 'FILE_REJECTED', errorCode: result.code });
      return;
    }
    const previewUrl = this.createPreviewUrl(file);
    this.dispatch({
      type: 'FILE_STAGED',
      photo: {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        previewUrl,
      },
    });
  }

  /** Create an object URL for the preview; tolerant of jsdom where URL.createObjectURL is absent. */
  private createPreviewUrl(file: File): string {
    const maker = (URL as { createObjectURL?: (b: Blob) => string }).createObjectURL;
    return typeof maker === 'function' ? maker.call(URL, file) : '';
  }

  /** Wire drag-over/leave/drop on the dropzone (drag-drop is an enhancement over the input). */
  private wireDropzone(zone: HTMLElement): void {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.setAttribute('data-dragover', 'true');
    });
    zone.addEventListener('dragleave', () => zone.setAttribute('data-dragover', 'false'));
    zone.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      zone.setAttribute('data-dragover', 'false');
      const file = e.dataTransfer?.files?.[0];
      if (file !== undefined) {
        this.handleFile(file);
      }
    });
  }

  /** Esc closes the sheet from any non-idle state (component-inventory §2 keyboard). */
  private onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.state.name !== 'idle') {
      this.dispatch({ type: 'CLOSE' });
    }
  }

  /** Emit host-facing CustomEvents when entering terminal states. */
  private runEntryEffects(previous: WidgetState, next: WidgetState): void {
    if (next.name === 'result' && previous.name !== 'result') {
      this.emit('tryit:result', { resultUrl: next.resultUrl ?? null });
    }
    if (next.name === 'error' && previous.name !== 'error') {
      this.emit('tryit:error', { code: next.errorCode ?? 'PROVIDER_ERROR' });
    }
  }

  /** Dispatch a composed, bubbling CustomEvent so the host page can observe widget outcomes. */
  private emit(name: string, detail: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /**
   * Drive the machine from outside (used by the host integration / tests to feed async job
   * outcomes). Exposed because network orchestration lives in the host glue, not the element.
   */
  send(event: WidgetEvent): void {
    this.dispatch(event);
  }

  /** Read-only snapshot of the current machine state (for tests/host introspection). */
  get currentState(): WidgetState {
    return this.state;
  }
}

/** Register the element exactly once; a double-define would throw and break the host page. */
export function defineTryItWidget(): void {
  if (customElements.get(TAG_NAME) === undefined) {
    customElements.define(TAG_NAME, TryItWidget);
  }
}

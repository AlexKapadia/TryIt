/**
 * @tryit/widget/state — the pure finite-state machine driving the try-on widget.
 *
 * The shopper journey is modelled as an explicit FSM so every transition is guarded,
 * auditable, and testable in isolation (no DOM required). The single privacy-critical
 * invariant lives here and is enforced by the transition table, not by convention:
 *
 *   - `upload` is reachable ONLY via the `CONSENT_ACCEPT` event fired from `consent`.
 *   - There is NO transition that carries a staged file or starts an upload from `idle`
 *     or `consent`. Declining consent (`CONSENT_DECLINE`) returns to `idle` and can never
 *     proceed. This is the fail-closed guarantee: no image can be uploaded before explicit
 *     consent (see threat model: process-then-purge, just-in-time consent).
 *
 * The machine is a pure function `transition(state, event) -> state`: identical inputs always
 * yield identical outputs, no side effects, no I/O. The custom element (`element.ts`) owns all
 * side effects and merely asks this module what the next state is.
 */

import type { ErrorCode } from '@tryit/contracts';

/** The discrete screens/phases the widget can occupy. */
export type WidgetStateName =
  | 'idle'
  | 'consent'
  | 'upload'
  | 'uploading'
  | 'processing'
  | 'result'
  | 'error';

/** A staged photo: the client-validated file plus an object URL for preview. */
export interface StagedPhoto {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Object URL for the original selfie, used in the before/after compare. */
  readonly previewUrl: string;
}

/**
 * The full machine state. `name` is the discriminant; the optional fields carry data that is
 * only meaningful in certain states (e.g. `photo` from `upload` onward, `errorCode` in `error`,
 * `resultUrl` in `result`). Keeping them optional rather than a per-state union keeps the
 * transition table flat and exhaustively testable.
 */
export interface WidgetState {
  readonly name: WidgetStateName;
  /** True once the shopper has explicitly accepted consent this session. */
  readonly consentGiven: boolean;
  readonly photo?: StagedPhoto;
  readonly jobId?: string;
  readonly resultUrl?: string;
  readonly errorCode?: ErrorCode;
}

/**
 * The events that can drive a transition. They are intentionally coarse — each maps to a real
 * shopper action or async outcome — so the transition table stays small and readable.
 */
export type WidgetEvent =
  | { type: 'OPEN' }
  | { type: 'CONSENT_ACCEPT' }
  | { type: 'CONSENT_DECLINE' }
  | { type: 'FILE_STAGED'; photo: StagedPhoto }
  | { type: 'FILE_CLEARED' }
  | { type: 'SUBMIT' }
  | { type: 'JOB_CREATED'; jobId: string }
  | { type: 'JOB_SUCCEEDED'; resultUrl: string }
  | { type: 'JOB_FAILED'; errorCode: ErrorCode }
  | { type: 'FILE_REJECTED'; errorCode: ErrorCode }
  | { type: 'RETRY' }
  | { type: 'CLOSE' };

/** The initial state of a freshly-mounted widget: closed, no consent, no photo. */
export const INITIAL_STATE: WidgetState = Object.freeze({
  name: 'idle',
  consentGiven: false,
});

/**
 * Compute the next state from the current state and an event. Pure and total: any
 * (state, event) pair that has no defined transition returns the input state unchanged
 * (fail-closed — an undefined edge never silently advances the flow).
 */
export function transition(state: WidgetState, event: WidgetEvent): WidgetState {
  switch (state.name) {
    case 'idle':
      // The only way out of idle is to OPEN into the consent gate. Privacy-critical:
      // there is deliberately no idle->upload edge, so no photo can be staged pre-consent.
      if (event.type === 'OPEN') {
        return { ...state, name: 'consent' };
      }
      return state;

    case 'consent':
      // CONSENT_ACCEPT is the SOLE path to `upload`. Declining fails closed back to idle.
      if (event.type === 'CONSENT_ACCEPT') {
        return { ...state, name: 'upload', consentGiven: true };
      }
      if (event.type === 'CONSENT_DECLINE' || event.type === 'CLOSE') {
        return { ...INITIAL_STATE };
      }
      return state;

    case 'upload':
      // Guard: a file may only be staged once consent has been given. Even if a FILE_STAGED
      // event somehow arrives without consent, it is refused (defence in depth).
      if (event.type === 'FILE_STAGED' && state.consentGiven) {
        return { ...state, photo: event.photo };
      }
      if (event.type === 'FILE_CLEARED') {
        return clearPhoto(state);
      }
      if (event.type === 'FILE_REJECTED') {
        return { ...clearPhoto(state), name: 'error', errorCode: event.errorCode };
      }
      // SUBMIT only proceeds when a photo is actually staged.
      if (event.type === 'SUBMIT' && state.photo !== undefined) {
        return { ...state, name: 'uploading' };
      }
      if (event.type === 'CLOSE') {
        return { ...INITIAL_STATE };
      }
      return state;

    case 'uploading':
      if (event.type === 'JOB_CREATED') {
        return { ...state, name: 'processing', jobId: event.jobId };
      }
      if (event.type === 'JOB_FAILED') {
        return { ...state, name: 'error', errorCode: event.errorCode };
      }
      if (event.type === 'CLOSE') {
        return { ...INITIAL_STATE };
      }
      return state;

    case 'processing':
      if (event.type === 'JOB_SUCCEEDED') {
        return { ...state, name: 'result', resultUrl: event.resultUrl };
      }
      if (event.type === 'JOB_FAILED') {
        return { ...state, name: 'error', errorCode: event.errorCode };
      }
      if (event.type === 'CLOSE') {
        return { ...INITIAL_STATE };
      }
      return state;

    case 'result':
      // From a successful result the shopper may try another photo (keeps consent) or close.
      if (event.type === 'RETRY') {
        return retryToUpload(state);
      }
      if (event.type === 'CLOSE') {
        return { ...INITIAL_STATE };
      }
      return state;

    case 'error':
      // Recovery returns to upload IF consent still holds; otherwise fails closed to idle so a
      // retry can never bypass the consent gate. The staged photo is preserved where present.
      if (event.type === 'RETRY') {
        return state.consentGiven ? retryToUpload(state) : { ...INITIAL_STATE };
      }
      if (event.type === 'CLOSE') {
        return { ...INITIAL_STATE };
      }
      return state;

    default:
      // Exhaustiveness guard: an unknown state name fails closed to idle.
      return { ...INITIAL_STATE };
  }
}

/** Return a copy of the state with any staged photo removed (process-then-purge posture). */
function clearPhoto(state: WidgetState): WidgetState {
  const { photo: _photo, errorCode: _errorCode, ...rest } = state;
  return { ...rest };
}

/**
 * Move back to the upload screen for a retry, preserving consent and any staged photo while
 * dropping the stale error/result/job. Used by both `result` and `error` recovery.
 */
function retryToUpload(state: WidgetState): WidgetState {
  const { resultUrl: _resultUrl, errorCode: _errorCode, jobId: _jobId, ...rest } = state;
  return { ...rest, name: 'upload' };
}

/** Convenience predicate: is a staged photo currently held? (Used by the close guard.) */
export function hasStagedPhoto(state: WidgetState): boolean {
  return state.photo !== undefined;
}

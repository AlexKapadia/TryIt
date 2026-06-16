/**
 * @tryit/widget/error-copy — humane, non-blaming copy + recovery for each contract error code.
 *
 * The mapping is TOTAL over the seven `ErrorCode` values (the compiler enforces this via a
 * `Record<ErrorCode, ...>` so a new code cannot be added without copy). Each entry mirrors the
 * component-inventory error table: a tone token (danger = user-correctable, warning = system,
 * wait), a humane message that blames the system where true, and the recovery affordance.
 */

import type { ErrorCode } from '@tryit/contracts';

/** The visual tone of an error: danger (user can fix) vs warning (system; wait). */
export type ErrorTone = 'danger' | 'warning';

/** The recovery affordance offered for an error. */
export type ErrorRecovery = 'retry' | 'close';

/** Friendly presentation for a single error code. */
export interface ErrorPresentation {
  readonly tone: ErrorTone;
  readonly message: string;
  readonly recovery: ErrorRecovery;
  /** Label for the recovery control. */
  readonly recoveryLabel: string;
}

/**
 * Total map from every {@link ErrorCode} to its shopper-facing presentation. Declared as a
 * `Record` keyed by the union, so omitting a code is a compile error (fail-closed copy).
 */
export const ERROR_PRESENTATION: Record<ErrorCode, ErrorPresentation> = {
  INVALID_INPUT: {
    tone: 'danger',
    message: "Something about that photo didn't work — let's try another.",
    recovery: 'retry',
    recoveryLabel: 'Try another photo',
  },
  PAYLOAD_TOO_LARGE: {
    tone: 'danger',
    message: "That photo's a bit large (max 8MB) — try a smaller one.",
    recovery: 'retry',
    recoveryLabel: 'Try another photo',
  },
  RATE_LIMITED: {
    tone: 'warning',
    message: "We're popular right now — try again in a few seconds.",
    recovery: 'retry',
    recoveryLabel: 'Try again',
  },
  BUDGET_EXCEEDED: {
    tone: 'warning',
    message: 'Try-on is taking a quick break here — please check back later.',
    recovery: 'close',
    recoveryLabel: 'Close',
  },
  KILL_SWITCH_ENGAGED: {
    tone: 'warning',
    message: 'Try-on is temporarily unavailable — please try again soon.',
    recovery: 'close',
    recoveryLabel: 'Close',
  },
  PROVIDER_ERROR: {
    tone: 'warning',
    message: "We hit a snag creating your preview — let's try again.",
    recovery: 'retry',
    recoveryLabel: 'Try again',
  },
  UNAUTHORIZED: {
    tone: 'danger',
    message: "Try-on isn't set up correctly on this store.",
    recovery: 'close',
    recoveryLabel: 'Close',
  },
};

/**
 * Resolve the presentation for a code. Total and fail-closed: an unrecognised runtime value
 * (outside the typed union) falls back to the generic provider-error presentation rather than
 * throwing or rendering a blank surface.
 */
export function presentationForCode(code: ErrorCode): ErrorPresentation {
  return ERROR_PRESENTATION[code] ?? ERROR_PRESENTATION.PROVIDER_ERROR;
}

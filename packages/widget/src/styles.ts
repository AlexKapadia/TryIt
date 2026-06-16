/**
 * @tryit/widget/styles — the shadow-DOM stylesheet, built from the design tokens.
 *
 * Every value here references a CSS custom property declared on `:host` (the design-token
 * contract in `docs/design/design-tokens.md` §9: zero hard-coded values in components). The
 * tokens are scoped to the shadow root so nothing leaks to or from the retailer's page, and
 * the widget is immune to the host's global CSS.
 *
 * Accessibility/motion: a `prefers-reduced-motion` block neutralises every entrance/shimmer
 * animation (opacity-only / static), and the focus ring is the accent and is never removed.
 */

/** Light-theme + dark-theme token declarations, scoped to the shadow host. */
const TOKENS = `
:host {
  --ti-accent: #0E7C7B;
  --ti-accent-hover: #0B6463;
  --ti-accent-active: #094F4E;
  --ti-accent-subtle: #E6F2F2;
  --ti-on-accent: #FFFFFF;

  --ti-canvas: #FBFAF8;
  --ti-surface: #FFFFFF;
  --ti-surface-raised: #FFFFFF;
  --ti-surface-sunken: #F4F2EE;
  --ti-border: #E7E3DC;
  --ti-border-strong: #D2CCC1;
  --ti-text: #1A1A17;
  --ti-text-secondary: #5A574F;
  --ti-text-tertiary: #86827A;
  --ti-text-disabled: #B4B0A7;

  --ti-success: #15803D;
  --ti-warning: #B45309;
  --ti-danger: #B91C1C;
  --ti-danger-subtle: #FBEAEA;
  --ti-warning-subtle: #FBF0E2;
  --ti-focus-ring: #0E7C7B;
  --ti-overlay: rgba(20,18,15,0.48);

  --ti-font-sans: "Geist", "Hanken Grotesk", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ti-weight-regular: 420;
  --ti-weight-medium: 520;
  --ti-weight-semibold: 600;
  --ti-weight-bold: 680;

  --ti-space-1: 4px;
  --ti-space-2: 8px;
  --ti-space-3: 12px;
  --ti-space-4: 16px;
  --ti-space-5: 24px;
  --ti-space-6: 32px;
  --ti-space-7: 48px;

  --ti-radius-sm: 8px;
  --ti-radius-md: 12px;
  --ti-radius-lg: 16px;
  --ti-radius-xl: 24px;
  --ti-radius-full: 9999px;

  --ti-dur-instant: 80ms;
  --ti-dur-fast: 160ms;
  --ti-dur-base: 240ms;
  --ti-dur-slow: 400ms;
  --ti-dur-reveal: 560ms;
  --ti-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ti-ease-linear: linear;

  --ti-widget-max: 440px;
  --ti-z-overlay: 2147483600;
  --ti-z-sheet: 2147483601;
}

:host([data-theme="dark"]) {
  --ti-accent: #2DD4BD;
  --ti-accent-hover: #5EE6D8;
  --ti-accent-active: #8BF0E6;
  --ti-accent-subtle: #0E2A2A;
  --ti-on-accent: #04201F;
  --ti-canvas: #0C0D0F;
  --ti-surface: #16181C;
  --ti-surface-raised: #1E2126;
  --ti-surface-sunken: #0A0B0D;
  --ti-border: #2A2D33;
  --ti-border-strong: #3A3E45;
  --ti-text: #F4F3F0;
  --ti-text-secondary: #A8A59C;
  --ti-text-tertiary: #76736B;
  --ti-text-disabled: #4D4F54;
  --ti-success: #4ADE80;
  --ti-warning: #FBBF24;
  --ti-danger: #F87171;
  --ti-danger-subtle: #2A0E0E;
  --ti-warning-subtle: #2A1F0A;
  --ti-focus-ring: #2DD4BD;
  --ti-overlay: rgba(0,0,0,0.64);
}
`;

/** Structural + component styles. All metrics reference the tokens above. */
const COMPONENTS = `
* { box-sizing: border-box; }

.ti-overlay {
  position: fixed; inset: 0;
  background: var(--ti-overlay);
  z-index: var(--ti-z-overlay);
  display: flex; align-items: center; justify-content: center;
  padding: var(--ti-space-4);
}

.ti-sheet {
  position: relative;
  width: 100%; max-width: var(--ti-widget-max);
  background: var(--ti-surface);
  color: var(--ti-text);
  border: 1px solid var(--ti-border);
  border-radius: var(--ti-radius-xl);
  box-shadow: 0 12px 32px rgba(20,18,15,0.14);
  font-family: var(--ti-font-sans);
  font-weight: var(--ti-weight-regular);
  z-index: var(--ti-z-sheet);
  padding: var(--ti-space-6);
  animation: ti-sheet-in var(--ti-dur-slow) var(--ti-ease-out);
}

@keyframes ti-sheet-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.ti-launcher {
  font-family: var(--ti-font-sans);
  font-weight: var(--ti-weight-semibold);
  background: var(--ti-accent); color: var(--ti-on-accent);
  border: none; border-radius: var(--ti-radius-full);
  padding: var(--ti-space-3) var(--ti-space-5);
  cursor: pointer;
  display: inline-flex; align-items: center; gap: var(--ti-space-2);
  min-height: 44px;
  transition: background var(--ti-dur-fast) var(--ti-ease-out);
}
.ti-launcher:hover { background: var(--ti-accent-hover); }
.ti-launcher:active { background: var(--ti-accent-active); }

.ti-title { font-size: 22px; line-height: 28px; font-weight: var(--ti-weight-semibold); margin: 0 0 var(--ti-space-4); }
.ti-display { font-size: 28px; line-height: 34px; font-weight: var(--ti-weight-bold); margin: 0 0 var(--ti-space-3); }
.ti-body { font-size: 16px; line-height: 24px; color: var(--ti-text-secondary); margin: 0 0 var(--ti-space-3); }
.ti-caption { font-size: 12px; line-height: 16px; color: var(--ti-text-tertiary); }
.ti-list { margin: 0 0 var(--ti-space-5); padding-left: var(--ti-space-4); }
.ti-list li { margin-bottom: var(--ti-space-2); color: var(--ti-text-secondary); font-size: 16px; line-height: 24px; }

.ti-actions { display: flex; gap: var(--ti-space-3); margin-top: var(--ti-space-5); }
.ti-btn {
  font-family: var(--ti-font-sans); font-weight: var(--ti-weight-semibold);
  font-size: 14px; min-height: 44px; padding: 0 var(--ti-space-4);
  border-radius: var(--ti-radius-md); cursor: pointer; flex: 1;
  transition: background var(--ti-dur-fast) var(--ti-ease-out);
}
.ti-btn-primary { background: var(--ti-accent); color: var(--ti-on-accent); border: none; }
.ti-btn-primary:hover { background: var(--ti-accent-hover); }
.ti-btn-secondary { background: var(--ti-surface); color: var(--ti-text); border: 1px solid var(--ti-border); }
.ti-btn:disabled { background: var(--ti-surface-sunken); color: var(--ti-text-disabled); cursor: not-allowed; border-color: var(--ti-border); }

.ti-dropzone {
  border: 2px dashed var(--ti-border-strong);
  background: var(--ti-surface-sunken);
  border-radius: var(--ti-radius-lg);
  padding: var(--ti-space-7) var(--ti-space-5);
  text-align: center;
}
.ti-dropzone[data-dragover="true"] { border-color: var(--ti-accent); background: var(--ti-accent-subtle); }
.ti-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; }

.ti-skeleton {
  background: var(--ti-surface-sunken);
  border-radius: var(--ti-radius-lg);
  height: 280px;
  position: relative; overflow: hidden;
}
.ti-skeleton::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  animation: ti-shimmer 1400ms var(--ti-ease-linear) infinite;
}
@keyframes ti-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }

.ti-result-frame { border-radius: var(--ti-radius-lg); overflow: hidden; border: 1px solid var(--ti-border); }
.ti-result-img { display: block; width: 100%; height: auto; animation: ti-reveal var(--ti-dur-reveal) var(--ti-ease-out); }
@keyframes ti-reveal { from { opacity: 0; } to { opacity: 1; } }

.ti-compare { position: relative; }
.ti-compare-slider { width: 100%; }

.ti-error { border-radius: var(--ti-radius-md); padding: var(--ti-space-4); }
.ti-error[data-tone="danger"] { background: var(--ti-danger-subtle); }
.ti-error[data-tone="warning"] { background: var(--ti-warning-subtle); }
.ti-error-icon { font-weight: var(--ti-weight-bold); }

.ti-close {
  position: absolute; top: var(--ti-space-4); right: var(--ti-space-4);
  width: 44px; height: 44px; border-radius: var(--ti-radius-full);
  background: transparent; border: none; color: var(--ti-text-secondary);
  cursor: pointer; font-size: 20px; line-height: 1;
}
.ti-close:hover { color: var(--ti-text); }

/* Focus ring — the accent, offset, NEVER removed (WCAG 2.2 AA, tokens §1.5). */
:host *:focus-visible,
.ti-launcher:focus-visible,
.ti-btn:focus-visible,
.ti-close:focus-visible,
.ti-file-input:focus-visible + label {
  outline: 2px solid var(--ti-focus-ring);
  outline-offset: 2px;
}
`;

/** Reduced-motion: drop every entrance/shimmer to instant/static (tokens §6.3). */
const REDUCED_MOTION = `
@media (prefers-reduced-motion: reduce) {
  .ti-sheet { animation: none; }
  .ti-result-img { animation: none; }
  .ti-skeleton::after { animation: none; background: none; }
  * { transition-duration: 1ms !important; }
}
`;

/** The complete stylesheet string injected into the widget's shadow root. */
export const WIDGET_STYLES = `${TOKENS}\n${COMPONENTS}\n${REDUCED_MOTION}`;

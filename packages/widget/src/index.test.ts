/**
 * Smoke test for the barrel: importing the package auto-registers <tryit-widget> and re-exports
 * the public surface. Proves the single-script-include integration works with no manual setup.
 */

import { describe, it, expect } from 'vitest';
import * as widget from './index.js';

describe('package barrel + auto-register', () => {
  it('auto-registers the custom element on import', () => {
    expect(customElements.get('tryit-widget')).toBe(widget.TryItWidget);
  });

  it('re-exports the pure public surface', () => {
    expect(typeof widget.transition).toBe('function');
    expect(typeof widget.createApiClient).toBe('function');
    expect(typeof widget.validateChosenFile).toBe('function');
    expect(typeof widget.presentationForCode).toBe('function');
    expect(typeof widget.renderConsent).toBe('function');
    expect(typeof widget.WIDGET_STYLES).toBe('string');
    expect(widget.INITIAL_STATE.name).toBe('idle');
  });
});

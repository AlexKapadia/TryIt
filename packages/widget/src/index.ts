/**
 * @tryit/widget — the framework-free embeddable try-on Web Component.
 *
 * Public barrel and auto-registration entry point. Importing this module (the package's `main`)
 * registers `<tryit-widget>` exactly once, so a retailer can drop in a single `<script>` and use
 * the tag with no framework. The pure pieces (state machine, render functions, API client,
 * validation, styles) are re-exported for advanced/host integrations and for testing.
 */

import { defineTryItWidget } from './element.js';

export { TryItWidget, defineTryItWidget, TAG_NAME } from './element.js';
export {
  transition,
  INITIAL_STATE,
  hasStagedPhoto,
  type WidgetState,
  type WidgetStateName,
  type WidgetEvent,
  type StagedPhoto,
} from './state.js';
export {
  createApiClient,
  type TryOnApiClient,
  type ApiClientConfig,
  type ApiResult,
  type FetchLike,
} from './api.js';
export { validateChosenFile, type FileValidation, type ChosenFile } from './validate-file.js';
export { presentationForCode, ERROR_PRESENTATION, type ErrorPresentation } from './error-copy.js';
export { WIDGET_STYLES } from './styles.js';
export {
  renderLauncher,
  renderConsent,
  renderUpload,
  renderUploading,
  renderProcessing,
  renderResult,
  renderError,
  renderSheet,
} from './render.js';

// Auto-register on import so `<tryit-widget>` works with a single script include.
// Guarded against double-define inside defineTryItWidget (idempotent).
defineTryItWidget();

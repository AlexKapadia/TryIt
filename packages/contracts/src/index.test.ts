import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

/**
 * The barrel re-exports every focused module. This guards against a module being dropped from
 * the public surface (a regression a consumer would only hit at integration time).
 */
describe('@tryit/contracts barrel', () => {
  it('re-exports the schema, type-parse, and helper surface from every module', () => {
    const expectedExports = [
      // images
      'ImageRefSchema',
      'parseImageRef',
      'safeParseImageRef',
      'ALLOWED_IMAGE_MIME_TYPES',
      'MAX_BASE64_DECODED_BYTES',
      // tryon
      'TryOnRequestSchema',
      'parseTryOnRequest',
      'safeParseTryOnRequest',
      'TryOnResultSchema',
      'parseTryOnResult',
      // jobs
      'TryOnJobSchema',
      'parseTryOnJob',
      // providers
      'ProviderIdSchema',
      'ProviderConfigSchema',
      'parseProviderConfig',
      // tenant
      'TenantConfigSchema',
      'parseTenantConfig',
      // audit
      'AuditEventSchema',
      'parseAuditEvent',
      // errors
      'ErrorCodeSchema',
      'ApiErrorSchema',
      'httpStatusForErrorCode',
      'makeApiError',
      'ERROR_CODE_HTTP_STATUS',
    ] as const;

    for (const name of expectedExports) {
      expect(contracts).toHaveProperty(name);
    }
  });

  it('the re-exported parser actually validates (end-to-end through the barrel)', () => {
    const request = contracts.parseTryOnRequest({
      tenantId: 't',
      shopperId: 's',
      personImage: { kind: 'url', url: 'https://example.com/p.jpg' },
      productId: 'p',
    });
    expect(request.category).toBe('apparel');
  });
});

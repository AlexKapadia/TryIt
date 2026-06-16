// @ts-check

/**
 * Next.js config for @tryit/demo-shop.
 *
 * `transpilePackages` lets Next compile the internal @tryit/* TypeScript sources directly,
 * so the storefront can embed the try-on widget without a separate prebuilt bundle step.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  // `standalone` emits a self-contained server under .next/standalone for the
  // production Dockerfile. Gated behind BUILD_STANDALONE because standalone's
  // symlinks fail with EPERM on Windows and break local builds + E2E. The
  // Dockerfile sets BUILD_STANDALONE=1.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
  transpilePackages: ['@tryit/widget', '@tryit/contracts'],
};

export default nextConfig;

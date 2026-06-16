// @ts-check

/**
 * Next.js config for @tryit/api.
 *
 * `transpilePackages` tells Next to compile the TypeScript sources of the internal
 * @tryit/* workspace packages through its own toolchain, so the API can consume them
 * directly without each package needing a separate prebuilt browser-targeted bundle.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  // `standalone` makes `next build` emit a self-contained server (server.js plus
  // a pruned node_modules) under .next/standalone for the slim production Docker
  // image. Gated behind BUILD_STANDALONE: standalone output creates symlinks that
  // fail with EPERM on Windows (no symlink privilege) and would break local builds
  // and the live E2E. The Dockerfiles set BUILD_STANDALONE=1.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
  transpilePackages: [
    '@tryit/contracts',
    '@tryit/security',
    '@tryit/engine',
    '@tryit/cache',
    '@tryit/catalog-connectors',
  ],
};

export default nextConfig;

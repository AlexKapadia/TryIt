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
  transpilePackages: [
    '@tryit/contracts',
    '@tryit/security',
    '@tryit/engine',
    '@tryit/cache',
    '@tryit/catalog-connectors',
  ],
};

export default nextConfig;

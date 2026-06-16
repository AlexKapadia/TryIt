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
  transpilePackages: ['@tryit/widget', '@tryit/contracts'],
};

export default nextConfig;

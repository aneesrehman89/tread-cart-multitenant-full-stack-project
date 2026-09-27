/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    TREADCART_API_URL: process.env.TREADCART_API_URL ?? 'http://localhost:4000',
    // Which store this storefront serves. In production the API resolves the
    // tenant from the hostname instead.
    TREADCART_STORE: process.env.TREADCART_STORE ?? 'apexauto',
    NEXT_PUBLIC_STORE: process.env.TREADCART_STORE ?? 'apexauto',
  },
};

export default nextConfig;

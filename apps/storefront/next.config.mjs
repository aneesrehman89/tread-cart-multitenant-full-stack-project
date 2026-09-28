/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    TREADCART_API_URL: process.env.TREADCART_API_URL ?? 'http://localhost:4000',
    // Dev-only tenant; production resolves by hostname.
    TREADCART_STORE: process.env.TREADCART_STORE ?? 'apexauto',
    // Public: the browser navigates here directly for OAuth redirects.
    NEXT_PUBLIC_API_URL: process.env.TREADCART_API_URL ?? 'http://localhost:4000',
    NEXT_PUBLIC_STORE: process.env.TREADCART_STORE ?? 'apexauto',
  },
};

export default nextConfig;

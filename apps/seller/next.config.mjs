/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    TREADCART_API_URL: process.env.TREADCART_API_URL ?? 'http://localhost:4000',
    // Public: the browser navigates here directly for OAuth redirects.
    NEXT_PUBLIC_API_URL: process.env.TREADCART_API_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;

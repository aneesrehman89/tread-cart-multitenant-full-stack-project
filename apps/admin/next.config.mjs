/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Server-side only: the browser always talks to this app's own proxy.
    TREADCART_API_URL: process.env.TREADCART_API_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;

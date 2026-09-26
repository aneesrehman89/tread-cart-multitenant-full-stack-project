/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    TREADCART_API_URL: process.env.TREADCART_API_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  eslint: {
    // Avoid Next.js invoking its legacy ESLint pipeline during builds.
    // We run lint via the root flat config separately.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

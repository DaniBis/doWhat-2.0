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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/my/rsvps',
        destination: '/my/attendance',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

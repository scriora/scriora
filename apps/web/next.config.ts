import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Images from object storage (MinIO / S3 / R2)
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
      },
    ],
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow next/image to render any URL (including dynamic signed S3 URLs)
    // without requiring explicit domain whitelisting in remotePatterns.
    unoptimized: true,
  },
};

export default nextConfig;

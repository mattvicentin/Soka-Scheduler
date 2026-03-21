/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    // Dev-only: disable webpack persistent cache so HMR doesn’t reference removed chunks
    // (fixes intermittent "Cannot find module './NNNN.js'" after edits). Slightly slower compiles.
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;

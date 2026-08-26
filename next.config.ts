/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "ubiquitous-zebra-4qjv7v65qjwwc77xw-3000.app.github.dev",
      ],
    },
  },
  allowedDevOrigins: [
    'ubiquitous-zebra-4qjv7v65qjwwc77xw-3000.app.github.dev',
  ],
};
export default nextConfig;
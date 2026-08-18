/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "redesigned-couscous-4j5g9vvw6r9p2jg66-3000.app.github.dev", // الرابط الخاص بك
      ],
    },
  },
};
module.exports = {
  allowedDevOrigins: [
    '3000-firebase-ma3rad-1774449402960.cluster-cbeiita7rbe7iuwhvjs5zww2i4.cloudworkstations.dev',
    '3000-firebase-ma3rad-1775811260599.cluster-64pjnskmlbaxowh5lzq6i7v4ra.cloudworkstations.dev',
    '*.monkeycode-ai.live',
  ],
}
export default nextConfig;
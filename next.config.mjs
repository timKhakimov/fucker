/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  api: {
    responseLimit: false,
  },
  serverActions: {
    bodySizeLimit: "100mb",
  },
  experimental: {
    serverActions: {
        bodySizeLimit: '100mb',
    }
}
};

export default nextConfig;

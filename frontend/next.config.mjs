/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow images from celoscan and other domains
  images: {
    domains: ["celoscan.io", "alfajores.celoscan.io"],
  },
  // Ensure viem/wagmi work with Next.js App Router
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      ws: false,
    };
    // Optional peer deps in @wagmi/connectors v8 — unused connectors, externalize
    config.externals = [
      ...(config.externals || []),
      "porto",
      "porto/internal",
      "@metamask/connect-evm",
      "@safe-global/safe-apps-sdk",
      "@safe-global/safe-apps-provider",
      "@coinbase/wallet-sdk",
    ];
    return config;
  },
};

export default nextConfig;

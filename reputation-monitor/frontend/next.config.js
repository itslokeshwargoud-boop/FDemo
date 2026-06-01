/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Exclude native modules from the serverless function webpack bundle.
  // better-sqlite3 is a C++ addon and must be loaded at runtime, not bundled.
  serverExternalPackages: ["better-sqlite3"],
};

module.exports = nextConfig;

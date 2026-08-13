/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Keep native Node ESM packages unbundled on the server to prevent Webpack runtime proxy issues
  serverExternalPackages: ['pdfjs-dist', 'tesseract.js'],
  // Enable standalone output for Docker deployment
  output: 'standalone',
}

export default nextConfig

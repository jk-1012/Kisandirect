/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // Aggressive image optimisation
  images: {
    formats: ['image/avif', 'image/webp'],   // AVIF first: 50% smaller than WebP
    deviceSizes: [320, 420, 640, 750],        // Only mobile sizes (farmers on phones)
    imageSizes: [16, 32, 64, 128, 200],
    minimumCacheTTL: 86400,                   // 24-hour CDN cache
    domains: ['cdn.kisandirect.in'],
    dangerouslyAllowSVG: false,
  },

  // Compression
  compress: true,

  // Strict headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https://cdn.kisandirect.in blob:",
              "connect-src 'self' https://api.kisandirect.in wss://api.kisandirect.in",
              "frame-src https://api.razorpay.com",
            ].join('; '),
          },
        ],
      },
      // Static assets: 1-year cache
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  experimental: {
    optimizeCss: true,         // inline critical CSS
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'recharts'],
  },
};

export default nextConfig;

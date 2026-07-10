module.exports = {
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  async rewrites() {
    return [
      {
        source: '/',
        destination: '/index.html',
      },
      {
        source: '/sitemap.xml',
        destination: '/api/sitemap',
      },
      {
        source: '/api/dummy.js',
        destination: '/api/dummy',
      },
    ];
  },
  async headers() {
    return [
      // Long-lived cache for static public assets (CSS, JS, images, fonts)
      {
        source: '/:path*\\.(css|js|woff|woff2|ttf|otf|png|jpg|jpeg|gif|svg|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Security + perf headers for all routes
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://spedostream2.shop; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; media-src 'self' http: https: blob: data:; connect-src 'self' https:; frame-src 'self' https:; frame-ancestors 'self';",
          }
        ],
      },
    ];
  },
};


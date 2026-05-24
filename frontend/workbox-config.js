module.exports = {
  globDirectory: 'out/',
  globPatterns: ['**/*.{js,css,html,png,svg,json}'],
  swDest: 'out/sw.js',
  clientsClaim: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.+$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'network-resources',
        expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 }
      }
    }
  ]
};

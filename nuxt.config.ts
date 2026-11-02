// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', 'nuxt-security'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  devServer: { port: 3100, host: '127.0.0.1' },
  ui: { fonts: false },
  icon: { provider: 'server', fallbackToApi: false, serverBundle: { collections: ['lucide'] } },
  nitro: {
    output: { dir: process.env.BUILD_OUTPUT_DIR || '.output' }, // rebuild.sh builds to .output.new
    serverAssets: [{ baseName: 'migrations', dir: './db/migrations' }],
  },
  runtimeConfig: { adminPasswordHash: '', dbPath: '', picturesDir: '' },
  security: {
    nonce: true,
    headers: {
      strictTransportSecurity: false, // nginx sets these three
      xContentTypeOptions: false,
      referrerPolicy: false,
      contentSecurityPolicy: {
        'default-src': ["'self'"], 'base-uri': ["'none'"], 'object-src': ["'none'"],
        'img-src': ["'self'", 'blob:', 'data:'], 'style-src': ["'self'", "'unsafe-inline'"],
        'font-src': ["'self'"], 'connect-src': ["'self'"],
        'script-src': ["'self'", "'nonce-{{nonce}}'"], 'upgrade-insecure-requests': false,
      },
    },
    rateLimiter: false, requestSizeLimiter: false, xssValidator: false, corsHandler: false,
  },
  compatibilityDate: '2025-07-15',
})

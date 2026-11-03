// https://nuxt.com/docs/api/configuration/nuxt-config
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// What the Technical details page reports. Docker has no .git, so its build passes GIT_COMMIT.
const require = createRequire(import.meta.url)
const packageVersion = (name: string) => {
  try {
    return (JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as { version: string }).version
  }
  catch {
    return 'unknown'
  }
}
const gitCommit = () => {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  }
  catch {
    return ''
  }
}
const build = {
  version: (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version,
  commit: process.env.GIT_COMMIT || gitCommit(),
  builtAt: new Date().toISOString(),
  nuxt: packageVersion('nuxt'),
  vue: packageVersion('vue'),
  nuxtUi: packageVersion('@nuxt/ui'),
  betterSqlite3: packageVersion('better-sqlite3'),
  heicDecode: packageVersion('heic-decode'),
}
export default defineNuxtConfig({
  modules: ['@nuxt/ui', 'nuxt-security'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  devServer: { port: 3100, host: '127.0.0.1' },
  app: {
    head: {
      title: 'OpenMantel',
      meta: [
        { name: 'robots', content: 'noindex' },
        { name: 'theme-color', content: '#10181c' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'OpenMantel' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192.png' },
      ],
    },
  },
  ui: { fonts: false },
  colorMode: { preference: 'dark', fallback: 'dark' },
  icon: { provider: 'server', fallbackToApi: false, serverBundle: { collections: ['lucide'] }, clientBundle: { scan: true } },
  nitro: {
    output: { dir: process.env.BUILD_OUTPUT_DIR || '.output' }, // rebuild.sh builds to .output.new
    serverAssets: [{ baseName: 'migrations', dir: './db/migrations' }],
  },
  routeRules: {
    '/sw.js': { headers: { 'Cache-Control': 'no-cache' } },
    '/admin/photos': { redirect: '/admin' },
  },
  runtimeConfig: { adminPasswordHash: '', dbPath: '', picturesDir: '', build, demoAutoload: true, demoSourceDir: '' },
  security: {
    nonce: true,
    sri: false, // Everything is self-hosted, and a stale hash blocks the whole page.
    headers: {
      strictTransportSecurity: false, // nginx sets these three
      xContentTypeOptions: false,
      referrerPolicy: false,
      permissionsPolicy: { 'fullscreen': ['self'], 'screen-wake-lock': ['self'] }, // The slideshow uses both.
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

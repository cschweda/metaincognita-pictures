import { db, migrated } from '../db'

// A brand-new install loads the demo once, so the admin shows how things work before the owner
// uploads anything. It never runs again on its own, and never on an install with photos.
export default defineNitroPlugin(() => {
  migrated.then(() => {
    if (useRuntimeConfig().demoAutoload === false || setting('demo_autoload')) return
    setSetting('demo_autoload', 'done')
    const photos = db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM photos`).get()?.n ?? 0
    if (photos === 0) startDemoLoad()
  }).catch(error => console.error('[demo] autoload failed', error))
})

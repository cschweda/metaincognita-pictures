import { db, migrated } from '../db'

// A brand-new install loads the demo once, so the admin shows how things work before the owner
// uploads anything. It never runs again on its own, and never on an install with photos.
export default defineNitroPlugin(() => {
  migrated.then(() => {
    if (useRuntimeConfig().demoAutoload === false || setting('demo_autoload')) return
    setSetting('demo_autoload', 'done')
    // Only a truly empty install. Frames, playlists, tags, or presets mean someone has started,
    // so it is left alone and marked live.
    const used = db.prepare(
      `SELECT 1 WHERE EXISTS (SELECT 1 FROM photos) OR EXISTS (SELECT 1 FROM devices) OR EXISTS (SELECT 1 FROM playlists)
         OR EXISTS (SELECT 1 FROM tags) OR EXISTS (SELECT 1 FROM presets)`,
    ).get()
    if (used) setSetting('mode', 'live')
    else startDemoLoad()
  }).catch(error => console.error('[demo] autoload failed', error))
})

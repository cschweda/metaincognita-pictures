import { migrated } from '../db'

// Importing the database module opens it and starts migrations at boot, not on the first request.
export default defineNitroPlugin(() => {
  migrated.catch((error) => {
    console.error('[db] migration failed', error)
  })
})

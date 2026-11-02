const { parsed: dotenv = {} } = require('dotenv').config({ path: `${__dirname}/.env`, quiet: true })

module.exports = {
  apps: [{
    name: 'pictures',
    script: '.output/server/index.mjs',
    cwd: __dirname,
    instances: 1, // SQLite + SSE: keep to one process, no cluster mode
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '400M',
    env: {
      ...dotenv, // NUXT_ADMIN_PASSWORD_HASH, NUXT_DB_PATH, NUXT_PICTURES_DIR
      NODE_ENV: 'production',
      PORT: 3100,
      HOST: '127.0.0.1',
    },
    time: true,
  }],
}

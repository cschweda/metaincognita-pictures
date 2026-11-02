// Prints an argon2id hash for NUXT_ADMIN_PASSWORD_HASH. Reads the password from a
// hidden prompt or from stdin, never from an argument, so it stays out of shell history.
import argon2 from 'argon2'

function readHidden(): Promise<string> {
  return new Promise((resolve) => {
    process.stderr.write('Password: ')
    process.stdin.setRawMode(true)
    process.stdin.setEncoding('utf8')
    let value = ''
    process.stdin.on('data', (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') process.exit(130)
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stderr.write('\n')
          resolve(value)
          return
        }
        value = char === '\u007f' ? value.slice(0, -1) : value + char
      }
    })
  })
}

async function readPiped(): Promise<string> {
  let value = ''
  for await (const chunk of process.stdin) value += chunk
  return value.replace(/\r?\n$/, '')
}

const password = process.stdin.isTTY ? await readHidden() : await readPiped()
if (!password) {
  console.error('No password given.')
  process.exit(1)
}

const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
})
console.log(`NUXT_ADMIN_PASSWORD_HASH='${hash}'`)

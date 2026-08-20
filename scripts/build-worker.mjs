import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

const productionEnv = readFileSync(resolve('.env.production'), 'utf8')
const productionPublicEnv = Object.fromEntries(
  productionEnv
    .split(/\r?\n/)
    .filter((line) => line.startsWith('NEXT_PUBLIC_'))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1).trim()]
    }),
)
const siteKey = productionPublicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY

if (!siteKey || siteKey.startsWith('1x')) {
  console.error('Production Turnstile site key is missing or still uses a test key.')
  process.exit(1)
}

if (
  productionPublicEnv.NEXT_PUBLIC_SITE_URL !== 'https://solidays.win' ||
  productionPublicEnv.NEXT_PUBLIC_R2_PUBLIC_URL !== 'https://solidays.win/media'
) {
  console.error('Production public environment is missing the expected site or media URL.')
  process.exit(1)
}

const child = spawn('opennextjs-cloudflare', ['build'], {
  env: { ...process.env, ...productionPublicEnv },
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

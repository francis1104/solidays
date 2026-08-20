import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

const productionEnv = readFileSync(resolve('.env.production'), 'utf8')
const siteKey = productionEnv
  .split(/\r?\n/)
  .find((line) => line.startsWith('NEXT_PUBLIC_TURNSTILE_SITE_KEY='))
  ?.split('=', 2)[1]
  ?.trim()

if (!siteKey || siteKey.startsWith('1x')) {
  console.error('Production Turnstile site key is missing or still uses a test key.')
  process.exit(1)
}

const child = spawn('opennextjs-cloudflare', ['build'], {
  env: { ...process.env, NEXT_PUBLIC_TURNSTILE_SITE_KEY: siteKey },
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

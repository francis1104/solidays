import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('.')

function fail(message) {
  console.error(`Production config check failed: ${message}`)
  process.exit(1)
}

function readEnvFile(path) {
  if (!existsSync(path)) fail(`missing ${path}`)

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator < 0) return [line.trim(), '']
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ''),
        ]
      }),
  )
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return walk(path)
    return [path]
  })
}

const productionEnv = readEnvFile(resolve(root, '.env.production'))
const siteKey = productionEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY

if (!siteKey || /^(1x|2x)/.test(siteKey)) {
  fail('NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing or uses a test key')
}

if (productionEnv.NEXT_PUBLIC_SITE_URL !== 'https://solidays.win') {
  fail('NEXT_PUBLIC_SITE_URL is not the production URL')
}

if (productionEnv.NEXT_PUBLIC_R2_PUBLIC_URL !== 'https://solidays.win/media') {
  fail('NEXT_PUBLIC_R2_PUBLIC_URL is not the production media URL')
}

const wranglerConfig = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8')
const requiredConfig = [
  ['Worker name', /"name"\s*:\s*"solidays-worker"/],
  ['workers_dev', /"workers_dev"\s*:\s*false/],
  ['CHAT_LOCAL_DEV', /"CHAT_LOCAL_DEV"\s*:\s*"false"/],
  ['CHAT_REALTIME_ENABLED', /"CHAT_REALTIME_ENABLED"\s*:\s*"true"/],
  ['solidays.win route', /"pattern"\s*:\s*"solidays\.win"/],
  ['www.solidays.win route', /"pattern"\s*:\s*"www\.solidays\.win"/],
  ['CHAT_DB binding', /"binding"\s*:\s*"CHAT_DB"/],
  ['CHAT_CONVERSATIONS binding', /"name"\s*:\s*"CHAT_CONVERSATIONS"/],
  ['TURNSTILE_SECRET_KEY requirement', /"TURNSTILE_SECRET_KEY"/],
]

for (const [label, pattern] of requiredConfig) {
  if (!pattern.test(wranglerConfig)) fail(`${label} is missing or has changed`)
}

const clientAssetsDirectory = resolve(root, '.open-next/assets/_next')
if (!existsSync(resolve(root, '.open-next/worker.js')) || !existsSync(clientAssetsDirectory)) {
  fail('production Worker build is missing; run worker:build first')
}

const assetFiles = walk(clientAssetsDirectory).filter((path) => /\.(js|mjs|json)$/.test(path))
const assetContents = assetFiles.map((path) => readFileSync(path, 'utf8'))
if (!assetContents.some((content) => content.includes(siteKey))) {
  fail('production Site Key is not present in the generated client assets')
}

const testKeyPatterns = [
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
]
if (assetContents.some((content) => testKeyPatterns.some((key) => content.includes(key)))) {
  fail('a Turnstile test key is present in generated client assets')
}

console.log('Production config check passed: env, Wrangler config, and client assets are production-ready.')

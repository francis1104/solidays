import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const cwd = process.cwd()
const yarnPath = path.join(cwd, '.yarn/releases/yarn-3.6.1.cjs')
const smokeScript = path.join(cwd, 'scripts/chat/concurrent-idempotency-smoke.mjs')
const port = Number(process.env.CHAT_LOCAL_PORT ?? 8787)
const origin = `http://localhost:${port}`
const reuseExistingBuild = process.env.CHAT_LOCAL_REUSE_BUILD === 'true'
const startupTimeoutMs = 30_000
const childShutdownTimeoutMs = 5_000

let persistDir = null
let workerProcess = null
let smokeProcess = null
let activeCommandProcess = null
let cleanupPromise = null
let requestedExitCode = null

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRunning(child) {
  return child && child.exitCode === null && child.signalCode === null
}

function waitForExit(child, timeoutMs) {
  if (!child) return Promise.resolve(true)

  return new Promise((resolve) => {
    let settled = false
    let timeout = null

    const finish = (result) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      child.removeListener('exit', onExit)
      resolve(result)
    }

    function onExit() {
      finish(true)
    }

    child.once('exit', onExit)
    if (!isRunning(child)) {
      finish(true)
      return
    }

    timeout = setTimeout(() => finish(false), timeoutMs)
  })
}

function waitForChildExit(child, onExit) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      child.removeListener('exit', handleExit)
      reject(error)
    }

    const handleExit = (code, signal) => {
      child.removeListener('error', handleError)
      resolve(onExit ? onExit(code, signal) : (code ?? (signal ? 1 : 0)))
    }

    child.once('error', handleError)
    child.once('exit', handleExit)
  })
}

async function terminateChild(child, label, processGroup = false) {
  if (!isRunning(child)) return true

  try {
    if (process.platform === 'win32') {
      child.kill('SIGTERM')
    } else if (child.pid && processGroup) {
      // Wrangler starts workerd as a child. The detached process group makes
      // sure cleanup covers both Wrangler and the Worker runtime.
      process.kill(-child.pid, 'SIGTERM')
    } else {
      child.kill('SIGTERM')
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      console.warn(
        `failed to stop ${label}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  if (await waitForExit(child, childShutdownTimeoutMs)) return true

  try {
    if (process.platform === 'win32') {
      child.kill('SIGKILL')
    } else if (child.pid && processGroup) {
      process.kill(-child.pid, 'SIGKILL')
    } else {
      child.kill('SIGKILL')
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      console.warn(
        `failed to force-stop ${label}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return waitForExit(child, childShutdownTimeoutMs)
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise

  cleanupPromise = (async () => {
    await terminateChild(smokeProcess, 'smoke test', true)
    const workerStopped = await terminateChild(workerProcess, 'local Worker', true)
    if (!workerStopped) console.warn('local Worker did not exit within the cleanup timeout')
    const commandProcess = activeCommandProcess
    await terminateChild(commandProcess, 'managed command', true)
    if (activeCommandProcess === commandProcess) activeCommandProcess = null

    if (persistDir) {
      await rm(persistDir, { recursive: true, force: true })
      persistDir = null
    }
  })()

  return cleanupPromise
}

function validatePort() {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`CHAT_LOCAL_PORT must be an integer between 1 and 65535 (received ${port})`)
  }
}

function checkHostPort(host) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    const onError = (error) => {
      server.close()
      reject(error)
    }

    server.once('error', onError)
    server.listen({ host, port }, () => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })
}

async function assertPortAvailable() {
  try {
    await checkHostPort('127.0.0.1')
    try {
      await checkHostPort('::1')
    } catch (error) {
      if (error?.code !== 'EAFNOSUPPORT' && error?.code !== 'EADDRNOTAVAIL') throw error
    }
  } catch (error) {
    if (error?.code === 'EADDRINUSE') {
      throw new Error(
        `localhost:${port} is already in use; stop the existing process before running the isolated smoke test`
      )
    }
    throw error
  }
}

function runYarn(args, env = process.env) {
  const child = spawn(process.execPath, [yarnPath, ...args], {
    cwd,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: process.platform !== 'win32',
  })
  activeCommandProcess = child
  return waitForChildExit(child, (code, signal) => {
    if (activeCommandProcess === child) activeCommandProcess = null
    return code ?? (signal ? 1 : 0)
  })
}

async function ensureWorkerBuild() {
  if (reuseExistingBuild) {
    try {
      await access(path.join(cwd, '.open-next/worker.js'))
      await access(path.join(cwd, '.open-next/assets'))
      console.log('Reusing existing OpenNext output because CHAT_LOCAL_REUSE_BUILD=true')
      return
    } catch {
      console.log('OpenNext output is missing; running one worker:build before starting Wrangler')
    }
  } else {
    console.log('Building the current Worker before starting Wrangler')
  }

  const code = await runYarn(['worker:build'])
  if (code !== 0) throw new Error(`worker:build failed with exit code ${code}`)
}

async function applyLocalMigrations() {
  console.log(`Applying committed D1 migrations to ${persistDir}`)
  const code = await runYarn([
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'solidays-chat',
    '--local',
    '--persist-to',
    persistDir,
    '--config',
    'wrangler.jsonc',
  ])
  if (code !== 0) throw new Error(`local D1 migrations failed with exit code ${code}`)
}

function startWorker() {
  workerProcess = spawn(
    process.execPath,
    [
      yarnPath,
      'wrangler',
      'dev',
      '--local',
      '--persist-to',
      persistDir,
      '--port',
      String(port),
      '--show-interactive-dev-session=false',
      '--var',
      'CHAT_LOCAL_DEV:true',
      '--var',
      'CHAT_REALTIME_ENABLED:true',
    ],
    {
      cwd,
      env: process.env,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    }
  )

  return workerProcess
}

async function waitForWorkerReady() {
  const deadline = Date.now() + startupTimeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    if (!isRunning(workerProcess)) {
      throw new Error(
        `local Worker exited before becoming ready (exit code ${workerProcess?.exitCode ?? 'unknown'})`
      )
    }

    try {
      const response = await fetch(`${origin}/`, {
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await delay(200)
  }

  throw new Error(
    `local Worker did not become ready within ${startupTimeoutMs}ms${lastError ? ` (${lastError.message})` : ''}`
  )
}

function runSmoke() {
  smokeProcess = spawn(process.execPath, [smokeScript], {
    cwd,
    env: {
      ...process.env,
      CHAT_LOCAL_ORIGIN: origin,
      CHAT_LOCAL_PERSIST_TO: persistDir,
    },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })

  return waitForChildExit(smokeProcess)
}

async function handleSignal(signal) {
  if (requestedExitCode !== null) return
  requestedExitCode = signal === 'SIGINT' ? 130 : 143
  await cleanup()
  process.exit(requestedExitCode)
}

process.once('SIGINT', () => void handleSignal('SIGINT'))
process.once('SIGTERM', () => void handleSignal('SIGTERM'))

let resultCode = 1
try {
  validatePort()
  await assertPortAvailable()
  await ensureWorkerBuild()
  persistDir = await mkdtemp(path.join(os.tmpdir(), 'solidays-chat-concurrency-'))
  await applyLocalMigrations()
  console.log(`Starting isolated local Worker on ${origin}`)
  console.log(`Using temporary local persistence: ${persistDir}`)
  startWorker()
  await waitForWorkerReady()
  const smokeCode = await runSmoke()
  if (smokeCode !== 0) throw new Error(`chat concurrency smoke failed with exit code ${smokeCode}`)
  resultCode = 0
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  await cleanup()
}

process.exitCode = requestedExitCode ?? resultCode

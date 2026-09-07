import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '../..')
const blenderPath = process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender'
const blenderScript = path.join(scriptDirectory, 'normalize-model.py')

const result = spawnSync(
  blenderPath,
  [
    '--background',
    '--factory-startup',
    '--disable-autoexec',
    '--python-exit-code',
    '1',
    '--python',
    blenderScript,
    '--',
    ...process.argv.slice(2),
  ],
  { cwd: repositoryRoot, stdio: 'inherit' }
)

if (result.error) {
  console.error(`Unable to start Blender at ${blenderPath}: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as THREE from 'three'
import { GLTFLoader, RGBELoader } from 'three-stdlib'
import { createDeskVideoTexture, disposeDeskModel, loadDeskAssets } from './desk-assets.ts'

test('asset readiness waits for every parsed resource; late loads after teardown are disposed', async (t) => {
  let resolveTable, resolveComputer, resolveEnvironment
  const table = new Promise((resolve) => {
    resolveTable = resolve
  })
  const computer = new Promise((resolve) => {
    resolveComputer = resolve
  })
  const environment = new Promise((resolve) => {
    resolveEnvironment = resolve
  })
  let calls = 0
  t.mock.method(GLTFLoader.prototype, 'loadAsync', () => (calls++ === 0 ? table : computer))
  t.mock.method(RGBELoader.prototype, 'loadAsync', () => environment)
  const changes: number[] = []
  const loading = loadDeskAssets(true, (value) => changes.push(value))
  let ready = false
  void loading.promise.then(() => {
    ready = true
  })
  const model = new THREE.Group()
  const geometry = new THREE.BoxGeometry()
  model.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()))
  let disposed = 0
  geometry.addEventListener('dispose', () => disposed++)
  resolveTable({ scene: new THREE.Group() })
  resolveEnvironment(new THREE.DataTexture())
  await Promise.resolve()
  assert.equal(ready, false)
  assert.ok(changes.at(-1)! < 100)
  loading.dispose()
  const progressAtExit = changes.length
  resolveComputer({ scene: model })
  await loading.promise
  assert.equal(disposed, 1)
  assert.equal(changes.length, progressAtExit)
  loading.dispose()
  assert.equal(disposed, 1)
})

test('model teardown releases shared geometry/material/maps exactly once', () => {
  const geometry = new THREE.BoxGeometry()
  const map = new THREE.Texture()
  const material = new THREE.MeshStandardMaterial({ map, normalMap: map })
  const counts = { geometry: 0, material: 0, map: 0 }
  geometry.addEventListener('dispose', () => counts.geometry++)
  material.addEventListener('dispose', () => counts.material++)
  map.addEventListener('dispose', () => counts.map++)
  const model = new THREE.Group()
  model.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material))
  disposeDeskModel(model)
  assert.deepEqual(counts, { geometry: 1, material: 1, map: 1 })
})

test('repeated screen sessions cancel every owned video frame callback on dispose', () => {
  const callbacks = new Set<number>()
  let id = 0
  const video = {
    requestVideoFrameCallback() {
      callbacks.add(++id)
      return id
    },
    cancelVideoFrameCallback(handle: number) {
      callbacks.delete(handle)
    },
  } as unknown as HTMLVideoElement
  for (let cycle = 0; cycle < 30; cycle++) {
    const texture = createDeskVideoTexture(video)
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace)
    assert.equal(texture.flipY, false)
    assert.equal(callbacks.size, 1)
    texture.dispose()
    assert.equal(callbacks.size, 0)
  }
})

function glb(path: string) {
  const buffer = readFileSync(path)
  return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString())
}

test('processed keyboard retains source Corona colors and curved display geometry', () => {
  const model = glb('public/desk/models/pc-mingtu.glb')
  const black = model.materials.find((material) => material.name === 'Acrylic Opaque Black')
  const red = model.materials.find((material) => material.name === 'Acrylic Opaque Autumn Maple')
  assert.ok(black.pbrMetallicRoughness.baseColorFactor[0] < 0.01)
  assert.ok(
    red.pbrMetallicRoughness.baseColorFactor[0] > red.pbrMetallicRoughness.baseColorFactor[1]
  )
  assert.ok(model.meshes.some((mesh) => mesh.name === 'Mesh.009' && mesh.primitives.length === 2))
})

test('web table texture payload is bounded; environment variants have intended resolution', () => {
  const bytes = readFileSync('public/desk/models/desk-web.glb')
  assert.ok(bytes.length < 2 * 1024 * 1024)
  for (const [name, width] of [
    ['1k', 1024],
    ['2k', 2048],
  ] as const) {
    const header = readFileSync(`public/desk/kloofendal-overcast-${name}.hdr`)
      .subarray(0, 512)
      .toString()
    assert.ok(header.includes(`-Y ${width / 2} +X ${width}`))
  }
})

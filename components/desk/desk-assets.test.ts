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

test('monitor rear foot rests inside the desk while the keyboard keeps its placement', async () => {
  const bytes = readFileSync('public/desk/models/pc-mingtu.glb')
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ''
  )
  scene.position.set(0, 1.62, -4.5)
  scene.updateMatrixWorld(true)
  const bounds = (name: string) => {
    const part = scene.getObjectByName(name)
    assert.ok(part, `Missing computer part: ${name}`)
    return new THREE.Box3().setFromObject(part)
  }
  const table = glb('public/desk/models/desk-web.glb')
  const tabletop = table.meshes.find((mesh) => mesh.name === 'Desk.001')
  const rearEdge = table.accessors[tabletop.primitives[0].attributes.POSITION].min[2] * 5.4 - 4
  assert.ok(bounds('Cube005').min.z > rearEdge + 0.2, 'Rear foot must leave a desk-edge margin')
  assert.ok(bounds('Cube004').max.z < bounds('base001').min.z - 0.2, 'Stand must not hit keyboard')
  // Keyboard's original world-space depth; monitor placement must not move it.
  assert.ok(Math.abs(bounds('base001').min.z - -3.839) < 0.001)
  assert.ok(Math.abs(bounds('base001').max.z - -3.013) < 0.001)
  const screenCenter = bounds('Mesh009_1').getCenter(new THREE.Vector3())
  assert.ok(Math.abs(screenCenter.z - -4.8172) < 0.001)
  disposeDeskModel(scene)
})

test('curved display UVs form a regular front projection, including the right-edge triangles', async () => {
  const bytes = readFileSync('public/desk/models/pc-mingtu.glb')
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ''
  )
  try {
    const screen = scene.getObjectByName('Mesh009_1') as THREE.Mesh
    assert.ok(screen?.isMesh, 'Missing display surface')
    const geometry = screen.geometry
    geometry.computeBoundingBox()
    const { min, max } = geometry.boundingBox!
    assert.ok(max.z - min.z > 0.17, 'Keep the physical screen curvature')
    const position = geometry.getAttribute('position')
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < position.count; i++) {
      const u = (position.getX(i) - min.x) / (max.x - min.x)
      // glTF V runs top to bottom; both poster and VideoTexture use flipY=false.
      const v = 1 - (position.getY(i) - min.y) / (max.y - min.y)
      assert.ok(Math.abs(uv.getX(i) - u) < 1e-5, `Uneven horizontal mapping at vertex ${i}`)
      assert.ok(Math.abs(uv.getY(i) - v) < 1e-5, `Bent video row at vertex ${i}`)
    }
    // Sample actual triangle interpolation, not just vertex bounds: the old
    // unwrap folded a horizontal video row upward near x=1.85 on the right.
    ;(screen.material as THREE.Material).side = THREE.DoubleSide
    scene.updateMatrixWorld(true)
    const ray = new THREE.Raycaster()
    for (const y of [0.8, 1.45, 2.1]) {
      for (const x of [-1.85, -1, 0, 1, 1.7, 1.8, 1.85, 1.88]) {
        ray.set(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1))
        const hit = ray.intersectObject(screen, false)[0]
        assert.ok(hit?.uv, `Screen must cover (${x}, ${y})`)
        assert.ok(Math.abs(hit.uv.x - (x - min.x) / (max.x - min.x)) < 1e-5)
        assert.ok(Math.abs(hit.uv.y - (1 - (y - min.y) / (max.y - min.y))) < 1e-5)
      }
    }
  } finally {
    disposeDeskModel(scene)
  }
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

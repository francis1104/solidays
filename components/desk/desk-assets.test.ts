import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as THREE from 'three'
import { GLTFLoader, RGBELoader } from 'three-stdlib'
import { createDeskVideoTexture, disposeDeskModel, loadDeskAssets } from './desk-assets.ts'

test('readiness waits for the visual pack and notes; late loads after teardown are disposed', async (t) => {
  let resolveScene, resolveNote, resolveEnvironment
  const scene = new Promise((resolve) => {
    resolveScene = resolve
  })
  const note = new Promise((resolve) => {
    resolveNote = resolve
  })
  const environment = new Promise((resolve) => {
    resolveEnvironment = resolve
  })
  let calls = 0
  const requestedUrls: string[] = []
  t.mock.method(GLTFLoader.prototype, 'loadAsync', (url) => {
    requestedUrls.push(url)
    return [scene, Promise.resolve({ scene: new THREE.Group() }), note][calls++]
  })
  t.mock.method(RGBELoader.prototype, 'loadAsync', () => environment)
  const changes: number[] = []
  const loading = loadDeskAssets(true, 'neon', (value) => changes.push(value))
  assert.equal(requestedUrls[0], '/desk/models/variants/desk-neon-mobile.glb')
  let ready = false
  void loading.promise.then(() => {
    ready = true
  })
  const model = new THREE.Group()
  const geometry = new THREE.BoxGeometry()
  model.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()))
  let disposed = 0
  geometry.addEventListener('dispose', () => disposed++)
  resolveScene({ scene: new THREE.Group() })
  resolveEnvironment(new THREE.DataTexture())
  await Promise.resolve()
  assert.equal(ready, false)
  assert.ok(changes.at(-1)! < 100)
  loading.dispose()
  const progressAtExit = changes.length
  resolveNote({ scene: model })
  await loading.promise
  assert.equal(disposed, 1)
  assert.equal(changes.length, progressAtExit)
  loading.dispose()
  assert.equal(disposed, 1)
})

test('Studio and Neon packs stay compact and mobile omits decorative geometry', () => {
  for (const variant of ['studio', 'neon'] as const) {
    const desktopPath = `public/desk/models/variants/desk-${variant}.glb`
    const mobilePath = `public/desk/models/variants/desk-${variant}-mobile.glb`
    const desktop = glb(desktopPath)
    const mobile = glb(mobilePath)
    const triangles = (model: ReturnType<typeof glb>) =>
      model.meshes
        .flatMap((mesh) => mesh.primitives)
        .reduce((sum, primitive) => sum + model.accessors[primitive.indices].count / 3, 0)

    assert.ok(readFileSync(desktopPath).length < 450000, `${variant}: desktop bytes`)
    assert.ok(readFileSync(mobilePath).length < 250000, `${variant}: mobile bytes`)
    assert.ok(triangles(desktop) < 10000, `${variant}: desktop triangles`)
    assert.ok(triangles(mobile) < triangles(desktop), `${variant}: mobile triangles`)
    assert.ok(desktop.nodes.some((node) => node.name === 'Desk'))
    assert.ok(desktop.nodes.some((node) => node.name === 'Computer'))
    assert.ok(desktop.nodes.some((node) => node.name === 'Radio'))
    assert.ok(desktop.nodes.some((node) => node.name === 'PhotoDisplay'))
    assert.ok(
      desktop.nodes.some((node) =>
        node.name?.startsWith(variant === 'studio' ? 'KeyboardKey' : 'NeonKey')
      ),
      `${variant}: primary controls keep their authored detail`
    )
  }
})

test('radio and exactly two selected note variants have bounded embedded assets', () => {
  for (const [name, width, height, maxBytes] of [
    ['vintage-radio', 2.24, 1.178666, 2200000],
    ['note-pad', 1.447307, 0.419208, 600000],
    ['note-paper', 1.441196, 0.008521, 600000],
  ] as const) {
    const path = `public/desk/models/${name}.glb`
    const model = glb(path)
    assert.equal(model.meshes.length, 1, `${name}: do not include the full source pack`)
    assert.ok(readFileSync(path).length < maxBytes, `${name}: texture budget`)
    assert.ok(model.images.every((image) => image.bufferView !== undefined && !image.uri))
    const bounds = model.meshes[0].primitives.map((p) => model.accessors[p.attributes.POSITION])
    const min = [0, 1, 2].map((i) => Math.min(...bounds.map((b) => b.min[i])))
    const max = [0, 1, 2].map((i) => Math.max(...bounds.map((b) => b.max[i])))
    assert.ok(Math.abs(min[1]) < 0.00001, `${name}: bottom sits on tabletop`)
    assert.ok(Math.abs(max[1] - height) < 0.00001, `${name}: normalized height`)
    assert.ok(Math.abs(max[0] - min[0] - width) < 0.00001, `${name}: normalized width`)
  }
})

test('downloaded room shell and lamp are compact self-contained web assets', () => {
  for (const [name, maxBytes, maxTriangles] of [
    ['room-wall-window', 100000, 1000],
    ['room-wall-straight', 100000, 1000],
    ['room-floor', 100000, 1000],
    ['room-ceiling', 100000, 500],
    ['desk-lamp', 800000, 6000],
  ] as const) {
    const path = `public/desk/models/${name}.glb`
    const model = glb(path)
    const triangles = model.meshes
      .flatMap((mesh) => mesh.primitives)
      .reduce((sum, primitive) => sum + model.accessors[primitive.indices].count / 3, 0)
    assert.ok(readFileSync(path).length < maxBytes, `${name}: web asset budget`)
    assert.ok(triangles <= maxTriangles, `${name}: triangle budget`)
    assert.ok((model.images ?? []).every((image) => image.bufferView !== undefined && !image.uri))
  }
})

test('mobile computer LOD keeps the curved display and removes only the dense key labels', () => {
  const desktop = glb('public/desk/models/pc-mingtu.glb')
  const mobile = glb('public/desk/models/pc-mingtu-mobile.glb')
  const triangles = (model: ReturnType<typeof glb>) =>
    model.meshes
      .flatMap((mesh) => mesh.primitives)
      .reduce((sum, primitive) => sum + model.accessors[primitive.indices].count / 3, 0)

  assert.ok(readFileSync('public/desk/models/pc-mingtu-mobile.glb').length < 2.5 * 1024 * 1024)
  assert.ok(triangles(mobile) < triangles(desktop) * 0.75)
  assert.ok(triangles(mobile) < 60000)
  assert.equal(
    mobile.nodes.some((node) => node.name === 'Letters.001'),
    false
  )
  assert.equal(
    mobile.nodes.some((node) => node.name === 'Plane.001'),
    true
  )
  assert.ok(mobile.meshes.some((mesh) => mesh.name === 'Mesh.009' && mesh.primitives.length === 2))
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
    assert.equal(texture.flipY, true)
    assert.equal(callbacks.size, 1)
    texture.dispose()
    assert.equal(callbacks.size, 0)
  }
})

function glb(path: string) {
  const buffer = readFileSync(path)
  return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString())
}

test('McDonalds cup is an upright self-contained web model that fits the existing spot', () => {
  const bytes = readFileSync('public/desk/models/mcdonalds-cup.glb')
  const model = glb('public/desk/models/mcdonalds-cup.glb')
  assert.ok(bytes.length < 2 * 1024 * 1024)
  assert.equal(model.meshes.length, 1)
  const primitive = model.meshes[0].primitives[0]
  const bounds = model.accessors[primitive.attributes.POSITION]
  assert.ok(Math.abs(bounds.min[1]) < 1e-5, 'Bottom-center origin must sit on the desk')
  assert.ok(bounds.max[1] > 0.99 && bounds.max[1] < 1.01, 'Height is normalized offline')
  assert.ok(bounds.max[0] - bounds.min[0] < 0.84, 'Do not exceed the original mug footprint')
  assert.ok(model.accessors[primitive.indices].count / 3 < 10000)
  assert.equal(model.images.length, 2)
  assert.ok(model.images.every((image) => image.bufferView !== undefined && !image.uri))
  const material = model.materials[primitive.material]
  assert.ok(material.pbrMetallicRoughness.baseColorTexture)
  assert.ok(Math.abs(material.normalTexture.scale - 0.117) < 1e-5)
})

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

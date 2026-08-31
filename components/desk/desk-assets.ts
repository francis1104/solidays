import * as THREE from 'three'
import { GLTFLoader, RGBELoader, type GLTFLoaderPlugin } from 'three-stdlib'

export type DeskAssets = {
  table: THREE.Group
  computer: THREE.Group
  cup: THREE.Group
  radio: THREE.Group
  notePad: THREE.Group
  notePaper: THREE.Group
  roomWallWindow: THREE.Group
  roomWallStraight: THREE.Group
  roomFloor: THREE.Group
  roomCeiling: THREE.Group
  lamp: THREE.Group
  environment: THREE.DataTexture
}

export function createDeskVideoTexture(video: HTMLVideoElement) {
  const texture = new THREE.VideoTexture(video)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  return texture
}

// These assets belong to one mounted Desk, not an unbounded global loader cache.
export function disposeDeskModel(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    for (const material of [object.material].flat()) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
    }
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textures.forEach((texture) => texture.dispose())
}

export function loadDeskAssets(mobile: boolean, onProgress: (progress: number) => void) {
  let disposed = false
  const owned: Array<() => void> = []
  const progress = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const report = (index: number, value: number) => {
    progress[index] = Math.max(progress[index], value)
    if (!disposed) onProgress(progress.reduce((sum, part) => sum + part, 0) / progress.length)
  }
  const track = <T>(promise: Promise<T>, index: number, release: (value: T) => void) =>
    promise.then((value) => {
      if (disposed) release(value)
      else owned.push(() => release(value))
      report(index, 100)
      return value
    })
  const downloading = (index: number) => (event: ProgressEvent) => {
    // Reserve each resource's last 10% for parsing/embedded image decoding.
    if (event.total > 0) report(index, Math.min(90, (event.loaded / event.total) * 90))
  }
  const manager = new THREE.LoadingManager()
  const loader = new GLTFLoader(manager)
  loader.register((parser) => {
    // Avoid ImageBitmap incompatibility with the existing embedded GLB textures.
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager)
    return { name: 'desk-compatible-texture-loader' } as GLTFLoaderPlugin & { name: string }
  })
  const dispose = () => {
    if (disposed) return
    disposed = true
    // FileLoader may deduplicate in-flight URLs across mounts. Do not abort a
    // shared request needed by a new Desk; every late result is disposed below.
    owned.splice(0).forEach((release) => release())
  }
  const computerPath = mobile ? '/desk/models/pc-mingtu-mobile.glb' : '/desk/models/pc-mingtu.glb'
  const promise = Promise.all([
    track(loader.loadAsync('/desk/models/desk-web.glb', downloading(0)), 0, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync(computerPath, downloading(1)), 1, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/mcdonalds-cup.glb', downloading(2)), 2, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/vintage-radio.glb', downloading(3)), 3, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/note-pad.glb', downloading(4)), 4, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/note-paper.glb', downloading(5)), 5, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/room-wall-window.glb', downloading(6)), 6, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/room-wall-straight.glb', downloading(7)), 7, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/room-floor.glb', downloading(8)), 8, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/room-ceiling.glb', downloading(9)), 9, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/desk-lamp.glb', downloading(10)), 10, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(
      new RGBELoader(manager).loadAsync(
        `/desk/kloofendal-overcast-${mobile ? '1k' : '2k'}.hdr`,
        downloading(11)
      ),
      11,
      (texture) => texture.dispose()
    ),
  ])
    .then(
      ([
        table,
        computer,
        cup,
        radio,
        notePad,
        notePaper,
        roomWallWindow,
        roomWallStraight,
        roomFloor,
        roomCeiling,
        lamp,
        environment,
      ]) => {
        environment.mapping = THREE.EquirectangularReflectionMapping
        return {
          table: table.scene,
          computer: computer.scene,
          cup: cup.scene,
          radio: radio.scene,
          notePad: notePad.scene,
          notePaper: notePaper.scene,
          roomWallWindow: roomWallWindow.scene,
          roomWallStraight: roomWallStraight.scene,
          roomFloor: roomFloor.scene,
          roomCeiling: roomCeiling.scene,
          lamp: lamp.scene,
          environment,
        }
      }
    )
    .catch((error: unknown) => {
      dispose()
      throw error
    })
  return { promise, dispose }
}

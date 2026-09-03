import * as THREE from 'three'
import { GLTFLoader, RGBELoader, type GLTFLoaderPlugin } from 'three-stdlib'

export type DeskAssets = {
  scenePack: THREE.Group
  notePad: THREE.Group
  notePaper: THREE.Group
  environment: THREE.DataTexture
}

export type DeskVisualVariant = 'studio' | 'neon'

export function createDeskVideoTexture(video: HTMLVideoElement) {
  const texture = new THREE.VideoTexture(video)
  texture.colorSpace = THREE.SRGBColorSpace
  // The current screen is an app-owned PlaneGeometry, not the old glTF UV
  // surface, so browser video pixels use Three's regular vertical orientation.
  texture.flipY = true
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

export function loadDeskAssets(
  mobile: boolean,
  variant: DeskVisualVariant,
  onProgress: (progress: number) => void
) {
  let disposed = false
  const owned: Array<() => void> = []
  const progress = [0, 0, 0, 0]
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
  const scenePath = `/desk/models/variants/desk-${variant}${mobile ? '-mobile' : ''}.glb`
  const promise = Promise.all([
    track(loader.loadAsync(scenePath, downloading(0)), 0, (gltf) => disposeDeskModel(gltf.scene)),
    track(loader.loadAsync('/desk/models/note-pad.glb', downloading(1)), 1, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(loader.loadAsync('/desk/models/note-paper.glb', downloading(2)), 2, (gltf) =>
      disposeDeskModel(gltf.scene)
    ),
    track(
      new RGBELoader(manager).loadAsync(
        `/desk/kloofendal-overcast-${mobile ? '1k' : '2k'}.hdr`,
        downloading(3)
      ),
      3,
      (texture) => texture.dispose()
    ),
  ])
    .then(([scenePack, notePad, notePaper, environment]) => {
      environment.mapping = THREE.EquirectangularReflectionMapping
      return {
        scenePack: scenePack.scene,
        notePad: notePad.scene,
        notePaper: notePaper.scene,
        environment,
      }
    })
    .catch((error: unknown) => {
      dispose()
      throw error
    })
  return { promise, dispose }
}

'use client'

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { DeskPhase, DeskTarget } from '@/lib/desk'
import { createDeskVideoTexture, loadDeskAssets, type DeskAssets } from './desk-assets'

type Pose = {
  position: [number, number, number]
  lookAt: [number, number, number]
}

const DESK_COLORS = {
  ink: '#080b10',
  wood: '#211b1a',
  woodEdge: '#382a26',
  black: '#101319',
  blackSoft: '#1a202a',
  blue: '#6b98c8',
  pink: '#f03e91',
  yellow: '#f4d35e',
  paper: '#efe4c2',
  green: '#75c7a0',
} as const

const DESK_POSE: Record<DeskTarget, Pose> = {
  computer: {
    position: [0, 3.45, 1.2],
    // Curved display bounds, including the computer's placement on the desk.
    lookAt: [0, 3.08, -4.82],
  },
  radio: {
    position: [-3.15, 2.7, 0.7],
    lookAt: [-3.45, 2.1, -4.2],
  },
  frame: {
    position: [2.8, 2.8, 0.7],
    lookAt: [3.25, 2.05, -4.2],
  },
  note: {
    position: [3.8, 4.7, 0.4],
    lookAt: [4.05, 1.65, -2.55],
  },
}

type CameraTransition = {
  startPosition: THREE.Vector3
  controlPositionA: THREE.Vector3
  controlPositionB: THREE.Vector3
  endPosition: THREE.Vector3
  startLookAt: THREE.Vector3
  controlLookAtA: THREE.Vector3
  controlLookAtB: THREE.Vector3
  endLookAt: THREE.Vector3
  duration: number
  elapsed: number
}

function cubicBezierPoint(
  out: THREE.Vector3,
  start: THREE.Vector3,
  controlA: THREE.Vector3,
  controlB: THREE.Vector3,
  end: THREE.Vector3,
  progress: number
) {
  const inverse = 1 - progress
  const inverseSquared = inverse * inverse
  const progressSquared = progress * progress

  out.set(0, 0, 0)
  out.addScaledVector(start, inverseSquared * inverse)
  out.addScaledVector(controlA, 3 * inverseSquared * progress)
  out.addScaledVector(controlB, 3 * inverse * progressSquared)
  out.addScaledVector(end, progressSquared * progress)
  return out
}

function createCameraTransition(
  startPosition: THREE.Vector3,
  startLookAt: THREE.Vector3,
  endPosition: THREE.Vector3,
  endLookAt: THREE.Vector3,
  target: DeskTarget | null,
  narrow: boolean,
  compact: boolean,
  phase: DeskPhase
): CameraTransition {
  const arcSign = target === 'radio' ? -1 : 1
  const arcScale = compact ? 0.55 : narrow ? 0.85 : 1.55
  const travel = endPosition.clone().sub(startPosition)
  const lookTravel = endLookAt.clone().sub(startLookAt)
  const positionArcA = new THREE.Vector3(arcSign * arcScale, compact ? 0.2 : 0.7, -0.7)
  const positionArcB = new THREE.Vector3(arcSign * arcScale * 0.58, compact ? 0.08 : 0.3, 0.2)
  const lookArcA = new THREE.Vector3(arcSign * arcScale * 0.24, compact ? 0.05 : 0.2, 0)
  const lookArcB = new THREE.Vector3(arcSign * arcScale * 0.14, compact ? 0.02 : 0.1, 0.05)

  return {
    startPosition: startPosition.clone(),
    controlPositionA: startPosition.clone().addScaledVector(travel, 0.22).add(positionArcA),
    controlPositionB: startPosition.clone().addScaledVector(travel, 0.78).add(positionArcB),
    endPosition: endPosition.clone(),
    startLookAt: startLookAt.clone(),
    controlLookAtA: startLookAt.clone().addScaledVector(lookTravel, 0.25).add(lookArcA),
    controlLookAtB: startLookAt.clone().addScaledVector(lookTravel, 0.75).add(lookArcB),
    endLookAt: endLookAt.clone(),
    duration:
      phase === 'leaving'
        ? compact
          ? 0.72
          : narrow
            ? 0.9
            : 1.05
        : compact
          ? 0.85
          : narrow
            ? 1.05
            : 1.25,
    elapsed: 0,
  }
}

function getPose(
  phase: DeskPhase,
  target: DeskTarget | null,
  narrow: boolean,
  compact: boolean,
  aspect: number
): Pose {
  if (phase === 'overview' || phase === 'loading' || phase === 'leaving' || !target) {
    if (compact) {
      return { position: [1.2, 5.2, 11.2], lookAt: [0, 0.65, -2.8] }
    }

    return narrow
      ? { position: [1.2, 6.9, 19.8], lookAt: [0, 0.65, -2.8] }
      : { position: [3.6, 6.4, 12.4], lookAt: [0, 0.65, -2.8] }
  }

  if (!narrow) return DESK_POSE[target]

  const pose = DESK_POSE[target]
  if (target === 'computer') {
    // Keep the actual screen center at every viewport; only back up enough to
    // fit its 3.85-unit width on portrait phones (rather than aiming below it).
    const halfFov = THREE.MathUtils.degToRad((compact ? 44 : 48) / 2)
    const distance = Math.max(6.02, 3.85 / (2 * Math.tan(halfFov) * aspect * 0.88))
    return { position: [0, pose.position[1], pose.lookAt[2] + distance], lookAt: pose.lookAt }
  }
  return {
    position: [pose.position[0] * 0.7, pose.position[1] * 0.7 + 0.45, pose.position[2] + 1.35],
    lookAt: [pose.lookAt[0] * 0.8, pose.lookAt[1] * 0.8, pose.lookAt[2]],
  }
}

function CameraRig({
  phase,
  target,
  reducedMotion,
  onSettled,
}: {
  phase: DeskPhase
  target: DeskTarget | null
  reducedMotion: boolean
  onSettled: () => void
}) {
  const { camera, invalidate, size } = useThree()
  const narrow = size.width < 640 || size.height < 520
  const compact = size.height < 520
  const aspect = size.width / Math.max(1, size.height)
  const pose = useMemo(
    () => getPose(phase, target, narrow, compact, aspect),
    [aspect, compact, narrow, phase, target]
  )
  const currentLookAtRef = useRef(new THREE.Vector3(0, 0.65, -2.35))
  const transitionRef = useRef<CameraTransition | null>(null)
  const transitionPositionRef = useRef(new THREE.Vector3())
  const transitionLookAtRef = useRef(new THREE.Vector3())
  const poseKey = `${phase}:${target ?? 'overview'}:${narrow ? 'narrow' : 'wide'}:${compact ? 'compact' : 'regular'}`

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const isOverview = phase === 'overview' || phase === 'loading'
    perspectiveCamera.fov = compact ? 44 : narrow ? (isOverview ? 60 : 48) : 42
    perspectiveCamera.updateProjectionMatrix()
  }, [camera, compact, narrow, phase])

  useEffect(() => {
    if (phase !== 'entering' && phase !== 'leaving') {
      transitionRef.current = null
      camera.position.set(...pose.position)
      camera.lookAt(...pose.lookAt)
      currentLookAtRef.current.set(...pose.lookAt)
      invalidate()
      return
    }

    const endPosition = new THREE.Vector3(...pose.position)
    const endLookAt = new THREE.Vector3(...pose.lookAt)

    if (reducedMotion) {
      transitionRef.current = null
      camera.position.copy(endPosition)
      camera.lookAt(endLookAt)
      currentLookAtRef.current.copy(endLookAt)
      onSettled()
      invalidate()
      return
    }

    transitionRef.current = createCameraTransition(
      camera.position.clone(),
      currentLookAtRef.current.clone(),
      endPosition,
      endLookAt,
      target,
      narrow,
      compact,
      phase
    )
    invalidate()
  }, [camera, compact, invalidate, narrow, onSettled, phase, pose, poseKey, reducedMotion, target])

  useFrame((_, delta) => {
    const transition = transitionRef.current
    if (!transition || reducedMotion || (phase !== 'entering' && phase !== 'leaving')) return

    transition.elapsed += Math.min(delta, 0.05)
    const linearProgress = Math.min(transition.elapsed / transition.duration, 1)
    const progress = linearProgress * linearProgress * (3 - 2 * linearProgress)

    cubicBezierPoint(
      transitionPositionRef.current,
      transition.startPosition,
      transition.controlPositionA,
      transition.controlPositionB,
      transition.endPosition,
      progress
    )
    cubicBezierPoint(
      transitionLookAtRef.current,
      transition.startLookAt,
      transition.controlLookAtA,
      transition.controlLookAtB,
      transition.endLookAt,
      progress
    )

    camera.position.copy(transitionPositionRef.current)
    camera.lookAt(transitionLookAtRef.current)
    currentLookAtRef.current.copy(transitionLookAtRef.current)

    if (linearProgress >= 1) {
      transitionRef.current = null
      camera.position.copy(transition.endPosition)
      camera.lookAt(transition.endLookAt)
      currentLookAtRef.current.copy(transition.endLookAt)
      onSettled()
    } else {
      invalidate()
    }
  })

  return null
}

function WebglLifecycle({ onContextLost }: { onContextLost: () => void }) {
  const { gl } = useThree()

  useEffect(() => {
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      onContextLost()
    }

    gl.domElement.addEventListener('webglcontextlost', handleContextLost)
    return () => gl.domElement.removeEventListener('webglcontextlost', handleContextLost)
  }, [gl, onContextLost])

  return null
}

function clickTarget(onSelect: (target: DeskTarget) => void, target: DeskTarget) {
  return (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    onSelect(target)
  }
}

const DESK_PC_SCREEN_MESH_NAME = 'Mesh009_1'
const DESK_ENVIRONMENT_BACKGROUND_INTENSITY = 2.5
const DESK_ENVIRONMENT_INTENSITY = 1.2
const DESK_TABLE_POSITION: [number, number, number] = [0, -2.8, -4]
const DESK_TABLE_SCALE: [number, number, number] = [5.4, 4.5, 5.4]
const DESK_SURFACE_Y = 1.62
const DESK_SURFACE_Z = -3.25
const DESK_PC_POSITION: [number, number, number] = [0, DESK_SURFACE_Y, -4.5]
const DESK_PC_SCALE = 1

function DeskEnvironment({ environment }: { environment: THREE.Texture }) {
  const { invalidate, scene } = useThree()

  useEffect(() => {
    const previousBackground = scene.background
    const previousEnvironment = scene.environment
    const previousBackgroundIntensity = scene.backgroundIntensity
    const previousEnvironmentIntensity = scene.environmentIntensity

    scene.background = environment
    scene.backgroundIntensity = DESK_ENVIRONMENT_BACKGROUND_INTENSITY
    scene.environment = environment
    scene.environmentIntensity = DESK_ENVIRONMENT_INTENSITY
    invalidate()

    return () => {
      scene.background = previousBackground
      scene.backgroundIntensity = previousBackgroundIntensity
      scene.environment = previousEnvironment
      scene.environmentIntensity = previousEnvironmentIntensity
      invalidate()
    }
  }, [environment, invalidate, scene])

  return null
}

function DeskTableModel({ scene }: { scene: THREE.Group }) {
  const model = useMemo(() => {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true

        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.color.set(DESK_COLORS.wood)
            material.roughness = 0.78
            material.metalness = 0.12
          }
        })
      }
    })

    return scene
  }, [scene])

  return (
    <primitive
      object={model}
      dispose={null}
      position={DESK_TABLE_POSITION}
      scale={DESK_TABLE_SCALE}
    />
  )
}

function DeskComputer({
  scene,
  poster,
  onSelect,
  videoElement,
  videoReady,
}: {
  scene: THREE.Group
  poster: THREE.Texture
  onSelect: (target: DeskTarget) => void
  videoElement: HTMLVideoElement | null
  videoReady: boolean
}) {
  const { invalidate } = useThree()
  const screenMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    []
  )

  useEffect(() => {
    const texture = videoElement && videoReady ? createDeskVideoTexture(videoElement) : null
    screenMaterial.map = texture ?? poster
    screenMaterial.needsUpdate = true
    invalidate()
    return () => {
      // Material.dispose alone does NOT dispose maps or cancel video frame callbacks.
      texture?.dispose()
      screenMaterial.map = null
    }
  }, [invalidate, poster, screenMaterial, videoElement, videoReady])

  useEffect(() => {
    return () => screenMaterial.dispose()
  }, [screenMaterial])

  const model = useMemo(() => {
    const clone = scene.clone(true)

    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return

      object.castShadow = true
      object.receiveShadow = true

      // GLTFLoader splits Plane.001 into Mesh009 (bezel) and Mesh009_1 (screen).
      if (object.name === DESK_PC_SCREEN_MESH_NAME) {
        object.material = screenMaterial
      }
    })

    return clone
  }, [scene, screenMaterial])

  const handleClick = clickTarget(onSelect, 'computer')

  return (
    <group position={DESK_PC_POSITION} scale={DESK_PC_SCALE} onClick={handleClick}>
      <primitive object={model} dispose={null} />
    </group>
  )
}

function DeskRadio({ onSelect }: { onSelect: (target: DeskTarget) => void }) {
  const handleClick = clickTarget(onSelect, 'radio')

  return (
    <group position={[-3.65, DESK_SURFACE_Y + 0.675, DESK_SURFACE_Z - 1.15]} onClick={handleClick}>
      <mesh>
        <boxGeometry args={[2.25, 1.35, 1.45]} />
        <meshStandardMaterial color="#090b0f" roughness={0.55} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.1, 0.74]}>
        <boxGeometry args={[1.78, 0.72, 0.06]} />
        <meshStandardMaterial color="#151b20" roughness={0.7} />
      </mesh>
      <mesh position={[-0.48, 0.12, 0.79]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.21, 0.21, 0.08, 24]} />
        <meshStandardMaterial color="#313941" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0.12, 0.1, 0.79]}>
        <planeGeometry args={[0.6, 0.18]} />
        <meshBasicMaterial color={DESK_COLORS.green} transparent opacity={0.82} />
      </mesh>
      <mesh position={[0.42, 0.12, 0.79]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.09, 20]} />
        <meshStandardMaterial color="#56606a" roughness={0.45} metalness={0.45} />
      </mesh>
      <mesh position={[0.6, 0.12, 0.79]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.1, 20]} />
        <meshStandardMaterial color="#56606a" roughness={0.45} metalness={0.45} />
      </mesh>
      <mesh position={[0.86, 0.82, 0.2]} rotation={[0, 0, -0.2]}>
        <cylinderGeometry args={[0.025, 0.025, 1.3, 8]} />
        <meshStandardMaterial color="#58606a" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  )
}

function DeskFrame({ onSelect }: { onSelect: (target: DeskTarget) => void }) {
  const handleClick = clickTarget(onSelect, 'frame')

  return (
    <group
      position={[3.45, DESK_SURFACE_Y + 1.35, DESK_SURFACE_Z - 1.15]}
      rotation={[0, -0.1, 0]}
      onClick={handleClick}
    >
      <mesh>
        <boxGeometry args={[2.2, 2.7, 0.18]} />
        <meshStandardMaterial color="#443a35" roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0, 0.12]}>
        <boxGeometry args={[1.86, 2.34, 0.05]} />
        <meshStandardMaterial color="#131820" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.17]}>
        <planeGeometry args={[1.66, 2.12]} />
        <meshBasicMaterial color="#31506a" transparent opacity={0.88} />
      </mesh>
      <mesh position={[0.3, 0.5, 0.19]} rotation={[0, 0, -0.12]}>
        <planeGeometry args={[0.76, 1.05]} />
        <meshBasicMaterial color="#7f9f98" transparent opacity={0.54} />
      </mesh>
      <mesh position={[-0.32, -0.42, 0.2]} rotation={[0, 0, 0.12]}>
        <planeGeometry args={[0.7, 0.92]} />
        <meshBasicMaterial color="#c28068" transparent opacity={0.58} />
      </mesh>
    </group>
  )
}

function DeskNote({ onSelect }: { onSelect: (target: DeskTarget) => void }) {
  const handleClick = clickTarget(onSelect, 'note')

  return (
    <group
      position={[4.25, DESK_SURFACE_Y + 0.04, DESK_SURFACE_Z + 0.45]}
      scale={0.75}
      rotation={[-Math.PI / 2, 0.08, -0.08]}
      onClick={handleClick}
    >
      <mesh>
        <boxGeometry args={[2.15, 1.55, 0.08]} />
        <meshStandardMaterial color={DESK_COLORS.paper} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0, 0.055]}>
        <planeGeometry args={[1.75, 1.18]} />
        <meshBasicMaterial color="#d5c49c" transparent opacity={0.46} />
      </mesh>
      <mesh position={[-0.66, 0.48, 0.11]}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshStandardMaterial color={DESK_COLORS.pink} roughness={0.45} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.15, 0.11]}>
        <boxGeometry args={[1.1, 0.04, 0.02]} />
        <meshBasicMaterial color="#6c6252" transparent opacity={0.62} />
      </mesh>
      <mesh position={[0, -0.05, 0.11]}>
        <boxGeometry args={[0.9, 0.04, 0.02]} />
        <meshBasicMaterial color="#6c6252" transparent opacity={0.62} />
      </mesh>
    </group>
  )
}

function DeskCup({ scene }: { scene: THREE.Group }) {
  return (
    <primitive
      object={scene}
      dispose={null}
      position={[-4.5, DESK_SURFACE_Y, DESK_SURFACE_Z + 0.45]}
    />
  )
}

function DeskScene({
  assets,
  poster,
  phase,
  target,
  reducedMotion,
  videoElement,
  videoReady,
  onSelect,
  onSettled,
  onContextLost,
  onReady,
}: {
  assets: DeskAssets
  poster: THREE.Texture
  phase: DeskPhase
  target: DeskTarget | null
  reducedMotion: boolean
  videoElement: HTMLVideoElement | null
  videoReady: boolean
  onSelect: (target: DeskTarget) => void
  onSettled: () => void
  onContextLost: () => void
  onReady: () => void
}) {
  return (
    <>
      <fog attach="fog" args={[DESK_COLORS.ink, 10, 40]} />
      <DeskEnvironment environment={assets.environment} />
      <ambientLight intensity={1.2} color="#9ba9c6" />
      <directionalLight position={[-4, 8, 5]} intensity={2.2} color="#d7ddff" />
      <pointLight position={[2, 2.8, 2]} intensity={15} distance={8} color="#ffca7a" />
      <pointLight position={[-4, 0.4, 1]} intensity={6} distance={5} color="#6c8fd4" />
      <CameraRig
        phase={phase}
        target={target}
        reducedMotion={reducedMotion}
        onSettled={onSettled}
      />
      <WebglLifecycle onContextLost={onContextLost} />
      <DeskTableModel scene={assets.table} />
      <DeskCup scene={assets.cup} />
      <DeskComputer
        scene={assets.computer}
        poster={poster}
        onSelect={onSelect}
        videoElement={videoElement}
        videoReady={videoReady}
      />
      <DeskRadio onSelect={onSelect} />
      <DeskFrame onSelect={onSelect} />
      <DeskNote onSelect={onSelect} />
      <SceneReady onReady={onReady} onError={onContextLost} />
    </>
  )
}

function SceneReady({ onReady, onError }: { onReady: () => void; onError: () => void }) {
  const { gl, scene, camera, invalidate } = useThree()
  const frames = useRef(0)
  const reported = useRef(false)
  useEffect(() => {
    let cancelled = false
    // Models, environment and first poster exist; warm shaders before revealing.
    void gl
      .compileAsync(scene, camera)
      .then(() => {
        if (!cancelled) {
          frames.current = 2
          invalidate()
        }
      })
      .catch(() => {
        if (!cancelled) onError()
      })
    return () => {
      cancelled = true
    }
  }, [camera, gl, invalidate, onError, scene])
  useFrame(() => {
    if (!frames.current || reported.current) return
    frames.current -= 1
    if (frames.current === 0) {
      reported.current = true
      onReady()
    } else invalidate()
  })
  return null
}

export default function DeskCanvas({
  posterUrl,
  phase,
  target,
  reducedMotion,
  videoElement,
  videoReady,
  videoPlaying,
  onSelect,
  onSettled,
  onReady,
  onContextLost,
  onProgress,
}: {
  posterUrl: string
  phase: DeskPhase
  target: DeskTarget | null
  reducedMotion: boolean
  videoElement: HTMLVideoElement | null
  videoReady: boolean
  videoPlaying: boolean
  onSelect: (target: DeskTarget) => void
  onSettled: () => void
  onReady: () => void
  onContextLost: () => void
  onProgress: (progress: number) => void
}) {
  const [mobile] = useState(
    () => window.matchMedia('(pointer: coarse), (max-width: 767px)').matches
  )
  const [assets, setAssets] = useState<DeskAssets | null>(null)
  const [poster, setPoster] = useState<THREE.Texture | null>(null)
  const progress = useRef({ assets: 0, poster: 0 })
  useEffect(() => {
    let cancelled = false
    const loading = loadDeskAssets(mobile, (value) => {
      progress.current.assets = value
      onProgress((value * 0.75 + progress.current.poster * 0.25) * 0.95)
    })
    void loading.promise
      .then((result) => {
        if (!cancelled) setAssets(result)
      })
      .catch(() => {
        if (!cancelled) onContextLost()
      })
    return () => {
      cancelled = true
      loading.dispose()
    }
  }, [mobile, onContextLost, onProgress])
  useEffect(() => {
    let cancelled = false
    new THREE.TextureLoader().load(
      posterUrl,
      (loaded) => {
        if (cancelled) {
          loaded.dispose()
          return
        }
        loaded.colorSpace = THREE.SRGBColorSpace
        loaded.flipY = false
        setPoster(loaded)
        progress.current.poster = 100
        onProgress((progress.current.assets * 0.75 + 25) * 0.95)
      },
      undefined,
      () => {
        if (!cancelled) onContextLost()
      }
    )
    return () => {
      cancelled = true
    }
  }, [onContextLost, onProgress, posterUrl])
  useEffect(() => () => poster?.dispose(), [poster])
  if (!assets || !poster) return null
  return (
    <Canvas
      className="h-full w-full"
      frameloop={videoPlaying ? 'always' : 'demand'}
      dpr={mobile ? 1 : [1, 1.5]}
      camera={{ position: [0, 5.2, 11.5], fov: 42, near: 0.1, far: 100 }}
      gl={{ antialias: !mobile, alpha: false, powerPreference: 'default' }}
      fallback={<div className="h-full w-full bg-[#080b10]" />}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
      }}
    >
      <DeskScene
        assets={assets}
        poster={poster}
        phase={phase}
        target={target}
        reducedMotion={reducedMotion}
        videoElement={videoElement}
        videoReady={videoReady}
        onSelect={onSelect}
        onSettled={onSettled}
        onContextLost={onContextLost}
        onReady={onReady}
      />
    </Canvas>
  )
}

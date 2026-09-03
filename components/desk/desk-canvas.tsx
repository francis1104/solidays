'use client'

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei/web/Html'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { DeskPhase, DeskTarget } from '@/lib/desk'
import {
  createDeskVideoTexture,
  loadDeskAssets,
  type DeskAssets,
  type DeskVisualVariant,
} from './desk-assets'
import { registerDeskNoteHost, type DeskNoteKind } from '@/lib/desk-chat'
import { DeskRadioControls, type DeskRadioControlsProps } from './desk-radio-controls'

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

const DESK_THEMES = {
  studio: {
    background: '#090d12',
    fog: '#0b1017',
    wall: '#20262a',
    wallInset: '#151b20',
    floor: '#18191b',
    frame: '#302a26',
    glass: '#132a3b',
    glassOpacity: 0.28,
    ambient: '#a8b5c5',
    ambientIntensity: 0.38,
    key: '#ffd6a0',
    keyIntensity: 20,
    window: '#6f9fd0',
    windowIntensity: 11,
    accent: '#e7a96b',
    secondary: '#7ea3b8',
    environmentIntensity: 0.48,
  },
  neon: {
    background: '#050711',
    fog: '#070815',
    wall: '#141626',
    wallInset: '#090b16',
    floor: '#0b0e19',
    frame: '#242940',
    glass: '#081a2f',
    glassOpacity: 0.34,
    ambient: '#7a82bb',
    ambientIntensity: 0.3,
    key: '#ff4fb8',
    keyIntensity: 17,
    window: '#55d9ff',
    windowIntensity: 16,
    accent: '#ff4fb8',
    secondary: '#55d9ff',
    environmentIntensity: 0.34,
  },
} as const

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
  variant: DeskVisualVariant,
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
      : { position: [2.6, 4.7, 11], lookAt: [0, 1.8, -4.2] }
  }

  if (target === 'note') {
    const portrait = aspect < 1
    return portrait
      ? { position: [3.65, 6.35, -1.45], lookAt: [3.65, 1.82, -2.6] }
      : { position: [3.6, 5.55, -1.5], lookAt: [3.6, 1.82, -2.6] }
  }

  const layout = DESK_LAYOUT[variant]
  const targetPose: Record<Exclude<DeskTarget, 'note'>, Pose> = {
    computer: {
      position: [0, layout.screen.position[1] + 0.35, layout.screen.position[2] + 5.8],
      lookAt: [layout.screen.position[0], layout.screen.position[1], layout.screen.position[2]],
    },
    radio: {
      position: [layout.radio[0] + 0.3, layout.radio[1] + 1.05, layout.radio[2] + 4.7],
      lookAt: [layout.radio[0], layout.radio[1] + 0.62, layout.radio[2]],
    },
    frame: {
      position: [layout.frame[0] - 0.38, layout.frame[1] + 0.25, layout.frame[2] + 4.8],
      lookAt: layout.frame,
    },
  }

  if (target === 'radio') {
    const halfFov = THREE.MathUtils.degToRad((compact ? 44 : narrow ? 48 : 42) / 2)
    const distance = Math.max(3.4, 2.24 / (2 * Math.tan(halfFov) * aspect * 0.85))
    return {
      position: [layout.radio[0] + 0.35, layout.radio[1] + 1.05, layout.radio[2] + distance],
      lookAt: [layout.radio[0], layout.radio[1] + 0.62, layout.radio[2]],
    }
  }
  if (!narrow) return targetPose[target]

  const pose = targetPose[target]
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
  variant,
  reducedMotion,
  onSettled,
}: {
  phase: DeskPhase
  target: DeskTarget | null
  variant: DeskVisualVariant
  reducedMotion: boolean
  onSettled: () => void
}) {
  const { camera, invalidate, size } = useThree()
  const narrow = size.width < 640 || size.height < 520
  const compact = size.height < 520
  const aspect = size.width / Math.max(1, size.height)
  const pose = useMemo(
    () => getPose(phase, target, variant, narrow, compact, aspect),
    [aspect, compact, narrow, phase, target, variant]
  )
  const currentLookAtRef = useRef(new THREE.Vector3(0, 0.65, -2.35))
  const transitionRef = useRef<CameraTransition | null>(null)
  const transitionPositionRef = useRef(new THREE.Vector3())
  const transitionLookAtRef = useRef(new THREE.Vector3())
  const poseKey = `${variant}:${phase}:${target ?? 'overview'}:${narrow ? 'narrow' : 'wide'}:${compact ? 'compact' : 'regular'}`

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

const DESK_ROOM_FLOOR_TOP = -3.38
const DESK_ROOM_BACK_Z = -8.2
const DESK_ROOM_CEILING_Y = 8.2
const DESK_LAYOUT = {
  studio: {
    surfaceY: 1.81,
    screen: { position: [0, 3.08, -3.96], size: [3.1, 1.78] },
    radio: [-3.65, 1.81, -3.65] as [number, number, number],
    frame: [3.2, 2.55, -3.88] as [number, number, number],
  },
  neon: {
    surfaceY: 1.64,
    screen: { position: [0, 2.86, -3.12], size: [3.2, 1.68] },
    radio: [-3.55, 1.64, -3.45] as [number, number, number],
    frame: [3.35, 2.45, -3.5] as [number, number, number],
  },
} as const

function DeskEnvironment({
  environment,
  variant,
}: {
  environment: THREE.Texture
  variant: DeskVisualVariant
}) {
  const { invalidate, scene } = useThree()
  const theme = DESK_THEMES[variant]

  useEffect(() => {
    const previousBackground = scene.background
    const previousEnvironment = scene.environment
    const previousBackgroundIntensity = scene.backgroundIntensity
    const previousEnvironmentIntensity = scene.environmentIntensity
    const background = new THREE.Color(theme.background)

    // Keep the HDR for reflections/IBL, but let the room shell own the visible
    // backdrop. Showing the HDR as the background makes the desk read like a
    // model floating in an environment viewer instead of a room.
    scene.background = background
    scene.backgroundIntensity = 1
    scene.environment = environment
    scene.environmentIntensity = theme.environmentIntensity
    invalidate()

    return () => {
      scene.background = previousBackground
      scene.backgroundIntensity = previousBackgroundIntensity
      scene.environment = previousEnvironment
      scene.environmentIntensity = previousEnvironmentIntensity
      invalidate()
    }
  }, [environment, invalidate, scene, theme.background, theme.environmentIntensity])

  return null
}

function createGroundingTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create the Desk contact shadow')
  const gradient = context.createRadialGradient(64, 64, 16, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(0,0,0,0.5)')
  gradient.addColorStop(0.65, 'rgba(0,0,0,0.3)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

function DeskVisualPack({ scene, variant }: { scene: THREE.Group; variant: DeskVisualVariant }) {
  const model = useMemo(() => {
    const clone = scene.clone(true)
    const studioPalette: Record<string, string> = {
      Desk: '#4a3028',
      DeskMat: '#14191c',
      DeskTrim: '#7d5538',
      Computer: '#20272c',
      Keyboard: '#252d31',
      KeyboardKey: '#161b1e',
      Mouse: '#30383b',
      Radio: '#8a4d32',
      PhotoDisplay: '#242b30',
      Lamp: '#4a4037',
      DeskSpeakerLeft: '#273035',
      DeskSpeakerRight: '#273035',
      Bookcase: '#3f3029',
      Books: '#72594d',
      Plant: '#435b4b',
      Chair: '#55493e',
      Rug: '#31383b',
    }
    const neonPalette: Record<string, string> = {
      Desk: '#1d263c',
      Computer: '#283452',
      Radio: '#30324e',
      PhotoDisplay: '#252f4a',
      ConsoleLeft: '#27334f',
      ConsoleRight: '#27334f',
      ContainerLeft: '#312d48',
      ContainerRight: '#312d48',
      Chair: '#252b43',
      FloorPanelLeft: '#151c30',
      FloorPanelRight: '#151c30',
      PipeLeft: '#343655',
      PipeRight: '#343655',
      NeonDeck: '#121b36',
      NeonKeyCyan: '#35c8ef',
      NeonKeyPink: '#f03e91',
    }
    const palette = variant === 'studio' ? studioPalette : neonPalette
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const semantic = object.name.split('__')[0]
      const materials = [object.material].flat().map((source) => {
        const material = source.clone()
        if (material instanceof THREE.MeshStandardMaterial) {
          const materialName = material.name.toLowerCase()
          const authoredMap = material.map
          material.roughness = variant === 'studio' ? 0.68 : 0.52
          material.metalness = variant === 'studio' ? 0.08 : 0.28
          if (semantic.startsWith('CityBuilding')) {
            material.color.set(variant === 'studio' ? '#26343b' : '#182447')
            material.emissive.set(variant === 'studio' ? '#111a20' : '#162654')
            material.emissiveIntensity = variant === 'studio' ? 0.28 : 0.8
          } else if (variant === 'neon' && authoredMap) {
            // The space-station models use a compact color atlas for edge,
            // panel and control detail. Tint it into the room palette instead
            // of flattening the entire prop to one color.
            material.color.set('#aebbd6')
            material.roughness = 0.48
            material.metalness = 0.22
          } else {
            const sourceLightness = material.color.getHSL({ h: 0, s: 0, l: 0 }).l
            const base = new THREE.Color(
              palette[semantic] ?? (variant === 'studio' ? '#343b3d' : '#293451')
            )
            const finish = materialName.includes('metaldark')
              ? 0.54
              : materialName.includes('metal')
                ? 0.82
                : materialName.includes('wood')
                  ? 1.04
                  : 0.76 + sourceLightness * 0.4
            base.multiplyScalar(finish)
            material.color.copy(base)
            if (materialName.includes('metal')) {
              material.roughness = variant === 'studio' ? 0.42 : 0.38
              material.metalness = variant === 'studio' ? 0.48 : 0.56
            }
            if (variant === 'neon' || semantic.startsWith('NeonKey')) {
              material.emissive.set('#090f28')
              material.emissiveIntensity = semantic.startsWith('NeonKey') ? 1.8 : 0.2
              if (semantic === 'NeonKeyCyan') material.emissive.set('#35c8ef')
              if (semantic === 'NeonKeyPink') material.emissive.set('#f03e91')
            }
          }
        }
        return material
      })
      object.material = Array.isArray(object.material) ? materials : materials[0]
      object.castShadow = false
      object.receiveShadow = true
    })
    return clone
  }, [scene, variant])

  useEffect(
    () => () => {
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        for (const material of [object.material].flat()) material.dispose()
      })
    },
    [model]
  )

  return <primitive object={model} dispose={null} />
}

function createCurtainGeometry(width: number, height: number, direction: -1 | 1) {
  const geometry = new THREE.PlaneGeometry(width, height, 12, 3)
  const positions = geometry.attributes.position as THREE.BufferAttribute
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const normalized = x / width + 0.5
    const fold = Math.sin(normalized * Math.PI * 6) * 0.13
    const falloff = 0.7 + normalized * 0.3
    positions.setZ(index, fold * falloff * direction)
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function DeskCurtain({ side }: { side: -1 | 1 }) {
  const geometry = useMemo(() => createCurtainGeometry(1.65, 6.45, side), [side])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh
      geometry={geometry}
      position={[side * 7.15, 2.7, DESK_ROOM_BACK_Z + 0.25]}
      rotation={[0, side * -0.08, 0]}
    >
      <meshStandardMaterial color="#25252b" roughness={0.94} side={THREE.DoubleSide} />
    </mesh>
  )
}

function DeskPropContactShadows({ variant }: { variant: DeskVisualVariant }) {
  const texture = useMemo(() => createGroundingTexture(), [])
  const layout = DESK_LAYOUT[variant]
  const shadows =
    variant === 'studio'
      ? [
          { position: [0, layout.surfaceY + 0.012, -4.0], size: [4.9, 2.15] },
          { position: [-3.65, layout.surfaceY + 0.014, -3.58], size: [2.75, 1.85] },
          { position: [3.55, layout.surfaceY + 0.014, -3.85], size: [3.5, 2.25] },
        ]
      : [
          { position: [0, layout.surfaceY + 0.012, -3.0], size: [5.3, 2.55] },
          { position: [-3.55, layout.surfaceY + 0.014, -3.42], size: [3.0, 2.25] },
          { position: [3.35, layout.surfaceY + 0.014, -3.72], size: [3.2, 2.25] },
        ]

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <>
      {shadows.map(({ position, size }, index) => (
        <mesh
          key={index}
          position={position as [number, number, number]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={size as [number, number]} />
          <meshBasicMaterial
            map={texture}
            transparent
            opacity={variant === 'studio' ? 0.42 : 0.3}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  )
}

function DeskWindowLife({
  variant,
  reducedMotion,
}: {
  variant: DeskVisualVariant
  reducedMotion: boolean
}) {
  const movingGroup = useRef<THREE.Group>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const { size } = useThree()
  const mobile = size.width < 768
  const dust = useMemo(() => {
    const count = mobile ? 40 : 130
    const values = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      values[index * 3] = (Math.random() - 0.5) * 18
      values[index * 3 + 1] = Math.random() * 10 - 2.5
      values[index * 3 + 2] = Math.random() * 8 - 8
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(values, 3))
    return geometry
  }, [mobile])
  const cityLights = useMemo(() => {
    const count = mobile ? 36 : 84
    const values = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      const column = index % 14
      const row = Math.floor(index / 14)
      values[index * 3] = -7.4 + column * 1.12 + Math.sin(index * 2.17) * 0.18
      values[index * 3 + 1] = -0.8 + row * 0.72 + (index % 3) * 0.08
      values[index * 3 + 2] = -15.2 - (index % 4) * 0.22
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(values, 3))
    return geometry
  }, [mobile])

  useEffect(
    () => () => {
      dust.dispose()
      cityLights.dispose()
    },
    [cityLights, dust]
  )

  useFrame(({ clock }) => {
    if (reducedMotion) return
    const elapsed = clock.getElapsedTime()
    if (movingGroup.current) {
      movingGroup.current.position.x = Math.sin(elapsed * 0.08) * 0.24
      movingGroup.current.position.y = Math.sin(elapsed * 0.13) * 0.08
    }
    if (glow.current) {
      glow.current.opacity = (variant === 'neon' ? 0.42 : 0.18) + Math.sin(elapsed * 1.2) * 0.04
    }
  })

  return (
    <>
      <mesh position={[0, 3.2, -21]}>
        <planeGeometry args={[28, 16]} />
        <meshBasicMaterial
          color={variant === 'studio' ? '#0c1d2b' : '#05061a'}
          toneMapped={false}
        />
      </mesh>
      <group ref={movingGroup}>
        <mesh position={variant === 'studio' ? [-4.8, 4.2, -14] : [-3.9, 4.6, -13.2]}>
          <planeGeometry args={variant === 'studio' ? [3.4, 0.18] : [4.6, 0.22]} />
          <meshBasicMaterial
            ref={glow}
            color={variant === 'studio' ? '#e1a05c' : '#ff4fb8'}
            transparent
            opacity={variant === 'studio' ? 0.18 : 0.42}
            toneMapped={false}
          />
        </mesh>
        {variant === 'neon' ? (
          <>
            <mesh position={[3.8, 3.5, -14.4]} rotation={[0, 0, -0.08]}>
              <planeGeometry args={[3.2, 0.16]} />
              <meshBasicMaterial color="#55d9ff" transparent opacity={0.42} toneMapped={false} />
            </mesh>
            <mesh position={[0.8, 6.2, -16]}>
              <planeGeometry args={[0.12, 3.6]} />
              <meshBasicMaterial color="#8d6cff" transparent opacity={0.3} toneMapped={false} />
            </mesh>
          </>
        ) : null}
        <points geometry={cityLights}>
          <pointsMaterial
            color={variant === 'studio' ? '#e5b66e' : '#60dfff'}
            size={variant === 'studio' ? 0.09 : 0.12}
            transparent
            opacity={variant === 'studio' ? 0.6 : 0.76}
            depthWrite={false}
            toneMapped={false}
          />
        </points>
      </group>
      <points geometry={dust}>
        <pointsMaterial
          color={variant === 'studio' ? '#d5d9d3' : '#72dcff'}
          size={variant === 'studio' ? 0.025 : 0.035}
          transparent
          opacity={variant === 'studio' ? 0.28 : 0.35}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </>
  )
}

function DeskRoomShell({
  variant,
  reducedMotion,
}: {
  variant: DeskVisualVariant
  reducedMotion: boolean
}) {
  const { size } = useThree()
  const compact = size.height < 520
  const theme = DESK_THEMES[variant]
  const grounding = useMemo(() => createGroundingTexture(), [])

  useEffect(() => () => grounding.dispose(), [grounding])

  return (
    <>
      <DeskWindowLife variant={variant} reducedMotion={reducedMotion} />
      <mesh position={[0, DESK_ROOM_FLOOR_TOP - 0.12, 3]}>
        <boxGeometry args={[24, 0.24, 26]} />
        <meshStandardMaterial
          color={theme.floor}
          roughness={0.92}
          metalness={variant === 'neon' ? 0.16 : 0.02}
        />
      </mesh>
      <mesh position={[-10.5, 2, 2]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[22, 11, 0.28]} />
        <meshStandardMaterial color={theme.wallInset} roughness={0.9} />
      </mesh>
      <mesh position={[10.5, 2, 2]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[22, 11, 0.28]} />
        <meshStandardMaterial color={theme.wallInset} roughness={0.9} />
      </mesh>
      <mesh position={[0, -2.05, DESK_ROOM_BACK_Z]}>
        <boxGeometry args={[21.2, 2.65, 0.35]} />
        <meshStandardMaterial color={theme.wall} roughness={0.88} />
      </mesh>
      <mesh position={[0, DESK_ROOM_FLOOR_TOP + 0.24, DESK_ROOM_BACK_Z + 0.22]}>
        <boxGeometry args={[20.7, 0.34, 0.22]} />
        <meshStandardMaterial color={theme.frame} roughness={0.7} metalness={0.12} />
      </mesh>
      <mesh position={[0, 7.05, DESK_ROOM_BACK_Z]}>
        <boxGeometry args={[21.2, 2.3, 0.35]} />
        <meshStandardMaterial color={theme.wall} roughness={0.88} />
      </mesh>
      <mesh position={[-8.55, 2.5, DESK_ROOM_BACK_Z]}>
        <boxGeometry args={[4.1, 6.8, 0.35]} />
        <meshStandardMaterial color={theme.wall} roughness={0.88} />
      </mesh>
      <mesh position={[8.55, 2.5, DESK_ROOM_BACK_Z]}>
        <boxGeometry args={[4.1, 6.8, 0.35]} />
        <meshStandardMaterial color={theme.wall} roughness={0.88} />
      </mesh>
      <mesh position={[0, 2.5, DESK_ROOM_BACK_Z - 0.08]}>
        <planeGeometry args={[13.2, 6.7]} />
        <meshPhysicalMaterial
          color={theme.glass}
          transparent
          opacity={theme.glassOpacity}
          roughness={0.18}
          metalness={0.05}
          depthWrite={false}
        />
      </mesh>
      {[-6.8, 0, 6.8].map((x) => (
        <mesh key={x} position={[x, 2.5, DESK_ROOM_BACK_Z + 0.08]}>
          <boxGeometry args={[0.18, 6.9, 0.24]} />
          <meshStandardMaterial color={theme.frame} roughness={0.52} metalness={0.35} />
        </mesh>
      ))}
      {[-0.9, 5.9].map((y) => (
        <mesh key={y} position={[0, y, DESK_ROOM_BACK_Z + 0.08]}>
          <boxGeometry args={[13.8, 0.18, 0.24]} />
          <meshStandardMaterial color={theme.frame} roughness={0.52} metalness={0.35} />
        </mesh>
      ))}
      {!compact ? (
        <mesh position={[0, DESK_ROOM_CEILING_Y, 3]}>
          <boxGeometry args={[24, 0.3, 26]} />
          <meshStandardMaterial color={theme.wallInset} roughness={0.92} />
        </mesh>
      ) : null}
      <mesh position={[0, DESK_ROOM_FLOOR_TOP + 0.01, -4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14.5, 9.2]} />
        <meshBasicMaterial map={grounding} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {variant === 'studio' ? (
        <>
          <DeskCurtain side={-1} />
          <DeskCurtain side={1} />
          <mesh position={[-8.25, 2.2, DESK_ROOM_BACK_Z + 0.34]}>
            <boxGeometry args={[1.7, 0.12, 0.36]} />
            <meshStandardMaterial color="#3d302a" roughness={0.72} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[-6.45, 2.5, DESK_ROOM_BACK_Z + 0.25]}>
            <boxGeometry args={[0.08, 6.2, 0.08]} />
            <meshBasicMaterial color={theme.accent} toneMapped={false} />
          </mesh>
          <mesh position={[6.45, 2.5, DESK_ROOM_BACK_Z + 0.25]}>
            <boxGeometry args={[0.08, 6.2, 0.08]} />
            <meshBasicMaterial color={theme.secondary} toneMapped={false} />
          </mesh>
          {[-4.5, -2.2, 2.2, 4.5].map((x, index) => (
            <mesh key={x} position={[x, -1.55, DESK_ROOM_BACK_Z + 0.3]}>
              <boxGeometry args={[1.65, 0.05, 0.06]} />
              <meshBasicMaterial
                color={index % 2 === 0 ? theme.secondary : theme.accent}
                transparent
                opacity={0.72}
                toneMapped={false}
              />
            </mesh>
          ))}
        </>
      )}
    </>
  )
}

function DeskComputer({
  variant,
  poster,
  onSelect,
  videoElement,
  videoReady,
}: {
  variant: DeskVisualVariant
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

  const handleClick = clickTarget(onSelect, 'computer')
  const layout = DESK_LAYOUT[variant]

  return (
    <group onClick={handleClick}>
      <mesh position={layout.screen.position}>
        <planeGeometry args={layout.screen.size} />
        <primitive object={screenMaterial} attach="material" />
      </mesh>
      <mesh position={[0, layout.screen.position[1] - 0.12, layout.screen.position[2] - 0.28]}>
        <boxGeometry args={[4.2, 2.8, variant === 'studio' ? 1.2 : 2.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function DeskRadio({
  variant,
  interactive,
  controls,
  onSelect,
}: {
  variant: DeskVisualVariant
  interactive: boolean
  controls: DeskRadioControlsProps
  onSelect: (target: DeskTarget) => void
}) {
  const handleClick = clickTarget(onSelect, 'radio')
  const position = DESK_LAYOUT[variant].radio

  return (
    <group position={position} onClick={handleClick}>
      <mesh position={[0, variant === 'studio' ? 0.65 : 0.78, 0]}>
        <boxGeometry args={variant === 'studio' ? [2.2, 1.55, 1.0] : [2.6, 1.8, 1.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html
        transform
        wrapperClass="desk-model-html"
        position={variant === 'studio' ? [0, 0.55, 0.56] : [0, 0.68, 0.98]}
        distanceFactor={variant === 'studio' ? 2.05 : 2.25}
        zIndexRange={[5, 1]}
        pointerEvents={interactive ? 'auto' : 'none'}
      >
        <div inert={!interactive} style={{ visibility: interactive ? 'visible' : 'hidden' }}>
          <DeskRadioControls {...controls} />
        </div>
      </Html>
    </group>
  )
}

function DeskFrame({
  variant,
  onSelect,
}: {
  variant: DeskVisualVariant
  onSelect: (target: DeskTarget) => void
}) {
  const handleClick = clickTarget(onSelect, 'frame')
  const position = DESK_LAYOUT[variant].frame

  return (
    <group position={position} rotation={[0, -0.1, 0]} onClick={handleClick}>
      <mesh>
        <boxGeometry args={variant === 'studio' ? [2.1, 2.3, 0.7] : [2.35, 2.0, 0.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, variant === 'studio' ? 0.38 : 0.5]}>
        <planeGeometry args={variant === 'studio' ? [1.35, 1.4] : [1.55, 1.15]} />
        <meshBasicMaterial
          color={variant === 'studio' ? '#7993a2' : '#55d9ff'}
          transparent
          opacity={variant === 'studio' ? 0.3 : 0.42}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function DeskPaper({
  scene,
  kind,
  position,
  rotation,
  surfaceHeight,
  interactive,
  showLabel,
  onSelect,
}: {
  scene: THREE.Group
  kind: DeskNoteKind
  position: [number, number, number]
  rotation: number
  surfaceHeight: number
  interactive: boolean
  showLabel: boolean
  onSelect: (target: DeskTarget) => void
}) {
  const registerHost = useCallback(
    (element: HTMLDivElement | null) => registerDeskNoteHost(kind, element),
    [kind]
  )
  return (
    <group position={position} rotation={[0, rotation, 0]} onClick={clickTarget(onSelect, 'note')}>
      <primitive object={scene} dispose={null} />
      <Html
        transform
        wrapperClass="desk-model-html"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, surfaceHeight, 0]}
        distanceFactor={1.575}
        zIndexRange={[5, 1]}
        pointerEvents={interactive ? 'auto' : 'none'}
      >
        <div className="desk-note-ink" inert={!interactive}>
          <div
            ref={registerHost}
            className="desk-note-host"
            style={{ visibility: interactive ? 'visible' : 'hidden' }}
          />
          {showLabel ? (
            <div className="desk-note-label" aria-hidden="true">
              <p>{kind === 'history' ? 'From Francis' : 'Leave a note'}</p>
              <span>{kind === 'history' ? '留言與回覆' : '寫點什麼吧'}</span>
            </div>
          ) : null}
        </div>
      </Html>
    </group>
  )
}

function DeskNotes({
  assets,
  variant,
  phase,
  target,
  onSelect,
}: {
  assets: DeskAssets
  variant: DeskVisualVariant
  phase: DeskPhase
  target: DeskTarget | null
  onSelect: (target: DeskTarget) => void
}) {
  const { size } = useThree()
  const portrait = size.width < size.height
  const interactive = phase === 'focused' && target === 'note'
  const showLabel = phase === 'overview' || (target === 'note' && !interactive)
  const surfaceY = DESK_LAYOUT[variant].surfaceY
  return (
    <>
      <DeskPaper
        scene={assets.notePad}
        kind="history"
        position={portrait ? [3.65, surfaceY, -3.4] : [2.8, surfaceY, -2.75]}
        rotation={0.035}
        surfaceHeight={0.426}
        interactive={interactive}
        showLabel={showLabel}
        onSelect={onSelect}
      />
      <DeskPaper
        scene={assets.notePaper}
        kind="compose"
        position={portrait ? [3.65, surfaceY, -1.8] : [4.4, surfaceY, -2.45]}
        rotation={-0.045}
        surfaceHeight={0.014}
        interactive={interactive}
        showLabel={showLabel}
        onSelect={onSelect}
      />
    </>
  )
}

function DeskScene({
  assets,
  variant,
  poster,
  phase,
  target,
  reducedMotion,
  videoElement,
  videoReady,
  radioControls,
  onSelect,
  onSettled,
  onContextLost,
  onReady,
}: {
  assets: DeskAssets
  variant: DeskVisualVariant
  poster: THREE.Texture
  phase: DeskPhase
  target: DeskTarget | null
  reducedMotion: boolean
  videoElement: HTMLVideoElement | null
  videoReady: boolean
  radioControls: DeskRadioControlsProps
  onSelect: (target: DeskTarget) => void
  onSettled: () => void
  onContextLost: () => void
  onReady: () => void
}) {
  const theme = DESK_THEMES[variant]
  return (
    <>
      <fog attach="fog" args={[theme.fog, 13, 38]} />
      <DeskEnvironment environment={assets.environment} variant={variant} />
      <ambientLight intensity={theme.ambientIntensity} color={theme.ambient} />
      <directionalLight
        position={[-4, 8, 5]}
        intensity={variant === 'studio' ? 1.1 : 0.6}
        color="#d7ddff"
      />
      <pointLight
        position={[4.5, 3.8, -4.2]}
        intensity={theme.keyIntensity}
        distance={10}
        color={theme.key}
      />
      <pointLight
        position={[-4.5, 4.5, -7.4]}
        intensity={theme.windowIntensity}
        distance={13}
        color={theme.window}
      />
      {variant === 'neon' ? (
        <pointLight position={[5.8, 2.6, -6.8]} intensity={14} distance={10} color="#8d6cff" />
      ) : null}
      <CameraRig
        phase={phase}
        target={target}
        variant={variant}
        reducedMotion={reducedMotion}
        onSettled={onSettled}
      />
      <WebglLifecycle onContextLost={onContextLost} />
      <DeskRoomShell variant={variant} reducedMotion={reducedMotion} />
      <DeskVisualPack scene={assets.scenePack} variant={variant} />
      <DeskPropContactShadows variant={variant} />
      <DeskComputer
        variant={variant}
        poster={poster}
        onSelect={onSelect}
        videoElement={videoElement}
        videoReady={videoReady}
      />
      <DeskRadio
        variant={variant}
        interactive={phase === 'focused' && target === 'radio'}
        controls={radioControls}
        onSelect={onSelect}
      />
      <DeskFrame variant={variant} onSelect={onSelect} />
      <DeskNotes
        assets={assets}
        variant={variant}
        phase={phase}
        target={target}
        onSelect={onSelect}
      />
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
  visualVariant,
  posterUrl,
  phase,
  target,
  reducedMotion,
  videoElement,
  videoReady,
  videoPlaying,
  radioControls,
  onSelect,
  onSettled,
  onReady,
  onContextLost,
  onProgress,
}: {
  visualVariant: DeskVisualVariant
  posterUrl: string
  phase: DeskPhase
  target: DeskTarget | null
  reducedMotion: boolean
  videoElement: HTMLVideoElement | null
  videoReady: boolean
  videoPlaying: boolean
  radioControls: DeskRadioControlsProps
  onSelect: (target: DeskTarget) => void
  onSettled: () => void
  onReady: () => void
  onContextLost: () => void
  onProgress: (progress: number) => void
}) {
  const [mobile] = useState(
    () => window.matchMedia('(pointer: coarse), (max-width: 767px)').matches
  )
  const [loadedAssets, setLoadedAssets] = useState<{
    variant: DeskVisualVariant
    value: DeskAssets
  } | null>(null)
  const [poster, setPoster] = useState<THREE.Texture | null>(null)
  const progress = useRef({ assets: 0, poster: 0 })
  useEffect(() => {
    let cancelled = false
    const loading = loadDeskAssets(mobile, visualVariant, (value) => {
      progress.current.assets = value
      onProgress((value * 0.75 + progress.current.poster * 0.25) * 0.95)
    })
    void loading.promise
      .then((result) => {
        if (!cancelled) setLoadedAssets({ variant: visualVariant, value: result })
      })
      .catch(() => {
        if (!cancelled) onContextLost()
      })
    return () => {
      cancelled = true
      loading.dispose()
    }
  }, [mobile, onContextLost, onProgress, visualVariant])
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
  if (!poster) return null
  const assets = loadedAssets?.variant === visualVariant ? loadedAssets.value : null
  // Keep every camera transition rendering even when no video is driving frames.
  const cameraMoving = phase === 'entering' || phase === 'leaving'
  const ambientMotion = !mobile && !reducedMotion
  return (
    <Canvas
      className="h-full w-full"
      style={{ overflow: 'clip' }}
      frameloop={videoPlaying || cameraMoving || ambientMotion ? 'always' : 'demand'}
      dpr={mobile ? 1 : [1, 1.5]}
      camera={{ position: [0, 5.2, 11.5], fov: 42, near: 0.1, far: 100 }}
      gl={{ antialias: !mobile, alpha: false, powerPreference: 'default' }}
      fallback={<div className="h-full w-full bg-[#080b10]" />}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = visualVariant === 'studio' ? 1.08 : 1.16
      }}
    >
      {assets ? (
        <DeskScene
          key={visualVariant}
          assets={assets}
          variant={visualVariant}
          poster={poster}
          phase={phase}
          target={target}
          reducedMotion={reducedMotion}
          videoElement={videoElement}
          videoReady={videoReady}
          radioControls={radioControls}
          onSelect={onSelect}
          onSettled={onSettled}
          onContextLost={onContextLost}
          onReady={onReady}
        />
      ) : null}
    </Canvas>
  )
}

'use client'

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { DeskPhase, DeskTarget } from '@/lib/desk'

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
    position: [0, 1.35, 4.7],
    lookAt: [0, 1.1, 0.05],
  },
  radio: {
    position: [-3.15, 0.15, 4.25],
    lookAt: [-3.45, -0.35, 0.1],
  },
  frame: {
    position: [3.15, 0.5, 4.2],
    lookAt: [3.45, 0.2, 0.05],
  },
  note: {
    position: [3.7, 1.35, 3.8],
    lookAt: [3.55, 0.85, 1.35],
  },
}

function getPose(
  phase: DeskPhase,
  target: DeskTarget | null,
  narrow: boolean,
  compact: boolean
): Pose {
  if (phase === 'overview' || phase === 'loading' || phase === 'leaving' || !target) {
    if (compact) {
      return { position: [0, 2.8, 8.5], lookAt: [0, -0.4, 0] }
    }

    return narrow
      ? { position: [0, 5.5, 23], lookAt: [0, -0.05, 0] }
      : { position: [0, 5.2, 11.5], lookAt: [0, -0.25, 0] }
  }

  if (!narrow) return DESK_POSE[target]

  const pose = DESK_POSE[target]
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
  const pose = useMemo(
    () => getPose(phase, target, narrow, compact),
    [compact, narrow, phase, target]
  )
  const doneRef = useRef(false)
  const poseKey = `${phase}:${target ?? 'overview'}:${narrow ? 'narrow' : 'wide'}`

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const isOverview = phase === 'overview' || phase === 'loading'
    perspectiveCamera.fov = compact ? 44 : narrow ? (isOverview ? 60 : 48) : 42
    perspectiveCamera.updateProjectionMatrix()
  }, [camera, compact, narrow, phase])

  useEffect(() => {
    doneRef.current = false

    if (phase !== 'entering' && phase !== 'leaving') {
      camera.position.set(...pose.position)
      camera.lookAt(...pose.lookAt)
      invalidate()
      return
    }

    if (reducedMotion) {
      camera.position.set(...pose.position)
      camera.lookAt(...pose.lookAt)
      doneRef.current = true
      onSettled()
    }

    invalidate()
  }, [camera, invalidate, onSettled, phase, pose, poseKey, reducedMotion])

  useFrame((_, delta) => {
    if (phase !== 'entering' && phase !== 'leaving') return
    if (reducedMotion) return

    const nextPosition = new THREE.Vector3(...pose.position)
    const nextLookAt = new THREE.Vector3(...pose.lookAt)
    const progress = 1 - Math.exp(-delta * 6)

    camera.position.lerp(nextPosition, progress)
    camera.lookAt(nextLookAt)

    if (camera.position.distanceTo(nextPosition) < 0.035) {
      camera.position.copy(nextPosition)
      camera.lookAt(nextLookAt)
      if (!doneRef.current) {
        doneRef.current = true
        onSettled()
      }
      return
    }

    invalidate()
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

function DeskTable() {
  return (
    <group>
      <mesh position={[0, -1.45, 0]} receiveShadow>
        <boxGeometry args={[12, 0.35, 8]} />
        <meshStandardMaterial color={DESK_COLORS.wood} roughness={0.9} />
      </mesh>
      <mesh position={[0, -1.23, -3.85]}>
        <boxGeometry args={[12, 0.1, 0.18]} />
        <meshStandardMaterial color={DESK_COLORS.woodEdge} roughness={0.85} />
      </mesh>
      <mesh position={[-5.75, -1.23, 0]}>
        <boxGeometry args={[0.18, 0.1, 7.7]} />
        <meshStandardMaterial color={DESK_COLORS.woodEdge} roughness={0.85} />
      </mesh>
      <mesh position={[5.75, -1.23, 0]}>
        <boxGeometry args={[0.18, 0.1, 7.7]} />
        <meshStandardMaterial color={DESK_COLORS.woodEdge} roughness={0.85} />
      </mesh>
    </group>
  )
}

function DeskComputer({ onSelect }: { onSelect: (target: DeskTarget) => void }) {
  const handleClick = clickTarget(onSelect, 'computer')

  return (
    <group position={[0, 0, 0.25]} onClick={handleClick}>
      <mesh position={[0, -0.48, 0]}>
        <boxGeometry args={[3.35, 0.18, 1.55]} />
        <meshStandardMaterial color={DESK_COLORS.blackSoft} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.62, -0.12]}>
        <boxGeometry args={[3.7, 2.45, 0.24]} />
        <meshStandardMaterial color={DESK_COLORS.black} roughness={0.45} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.64, 0.03]}>
        <planeGeometry args={[3.25, 1.9]} />
        <meshBasicMaterial color="#25354b" />
      </mesh>
      <mesh position={[0, 0.64, 0.045]}>
        <planeGeometry args={[2.98, 1.63]} />
        <meshBasicMaterial color="#334b65" transparent opacity={0.74} />
      </mesh>
      <mesh position={[0, -0.04, -0.02]}>
        <boxGeometry args={[0.28, 0.9, 0.28]} />
        <meshStandardMaterial color={DESK_COLORS.blackSoft} roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.52, 0.12]}>
        <boxGeometry args={[1.35, 0.05, 0.8]} />
        <meshStandardMaterial color="#2a303b" roughness={0.55} />
      </mesh>
      <mesh position={[0.55, -0.48, 0.48]}>
        <boxGeometry args={[0.18, 0.03, 0.25]} />
        <meshBasicMaterial color={DESK_COLORS.pink} />
      </mesh>
      <mesh position={[0, 0.64, 0.07]}>
        <planeGeometry args={[3.05, 0.025]} />
        <meshBasicMaterial color={DESK_COLORS.blue} transparent opacity={0.42} />
      </mesh>
    </group>
  )
}

function DeskRadio({ onSelect }: { onSelect: (target: DeskTarget) => void }) {
  const handleClick = clickTarget(onSelect, 'radio')

  return (
    <group position={[-3.65, -0.53, 0.35]} onClick={handleClick}>
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
    <group position={[3.55, -0.4, 0.05]} rotation={[0, -0.1, 0]} onClick={handleClick}>
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
    <group position={[3.6, 0.75, 1.5]} rotation={[0.03, -0.08, -0.08]} onClick={handleClick}>
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

function DeskDetails() {
  const mugPosition = useMemo<[number, number, number]>(() => [-4.55, -0.7, 1.4], [])

  return (
    <group>
      <mesh position={mugPosition}>
        <cylinderGeometry args={[0.42, 0.35, 0.7, 20]} />
        <meshStandardMaterial color="#ad675c" roughness={0.82} />
      </mesh>
      <mesh position={[-4.55, -0.7, 1.78]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.06, 10, 20]} />
        <meshStandardMaterial color="#ad675c" roughness={0.82} />
      </mesh>
      <mesh position={[4.65, -0.65, -2.1]} rotation={[0, 0, 0.1]}>
        <boxGeometry args={[1.2, 0.05, 1.8]} />
        <meshStandardMaterial color="#252a32" roughness={0.82} />
      </mesh>
      <mesh position={[-1.8, -1.16, -2.8]}>
        <boxGeometry args={[0.65, 0.08, 0.95]} />
        <meshStandardMaterial color="#171b22" roughness={0.8} />
      </mesh>
    </group>
  )
}

function DeskScene({
  phase,
  target,
  reducedMotion,
  onSelect,
  onSettled,
  onContextLost,
}: {
  phase: DeskPhase
  target: DeskTarget | null
  reducedMotion: boolean
  onSelect: (target: DeskTarget) => void
  onSettled: () => void
  onContextLost: () => void
}) {
  return (
    <>
      <color attach="background" args={[DESK_COLORS.ink]} />
      <fog attach="fog" args={[DESK_COLORS.ink, 10, 40]} />
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
      <DeskTable />
      <DeskDetails />
      <DeskComputer onSelect={onSelect} />
      <DeskRadio onSelect={onSelect} />
      <DeskFrame onSelect={onSelect} />
      <DeskNote onSelect={onSelect} />
    </>
  )
}

export default function DeskCanvas({
  phase,
  target,
  reducedMotion,
  onSelect,
  onSettled,
  onReady,
  onContextLost,
}: {
  phase: DeskPhase
  target: DeskTarget | null
  reducedMotion: boolean
  onSelect: (target: DeskTarget) => void
  onSettled: () => void
  onReady: () => void
  onContextLost: () => void
}) {
  return (
    <Canvas
      className="h-full w-full"
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [0, 5.2, 11.5], fov: 42, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      fallback={<div className="h-full w-full bg-[#080b10]" />}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        onReady()
      }}
    >
      <DeskScene
        phase={phase}
        target={target}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
        onSettled={onSettled}
        onContextLost={onContextLost}
      />
    </Canvas>
  )
}

"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Sky, useGLTF, OrbitControls } from "@react-three/drei";
import { Component, Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

const SHIP_GLB = "/ship.glb"; // place converted asset in apps/web/public/

class ModelBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <FallbackHull /> : this.props.children;
  }
}

function ShipModel() {
  const { scene } = useGLTF(SHIP_GLB);
  const s = useMemo(() => {
    const c = scene.clone();
    c.traverse((o) => { o.castShadow = true; });
    return c;
  }, [scene]);
  return <primitive object={s} />;
}

function FallbackHull() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[12, 1, 1.8]} />
        <meshStandardMaterial color="#b03a2e" />
      </mesh>
      <mesh position={[-3.5, 1.6, 0]}>
        <boxGeometry args={[1.5, 1.2, 1.6]} />
        <meshStandardMaterial color="#ecf0f1" />
      </mesh>
      <mesh position={[5.8, 0.9, 0]} rotation={[0, 0, -0.4]}>
        <coneGeometry args={[0.9, 1.6, 4]} />
        <meshStandardMaterial color="#b03a2e" />
      </mesh>
    </group>
  );
}

function Ship({ stateRef }) {
  const group = useRef();
  useFrame(() => {
    const s = stateRef.current;
    if (!s || !group.current) return;
    // sim meters -> scene units (1:10 for a comfortable view)
    group.current.position.set(s.pos[0] / 10, 0, -s.pos[1] / 10);
    group.current.rotation.y = s.yaw_rad;
  });
  return (
    <group ref={group}>
      <ModelBoundary>
        <Suspense fallback={<FallbackHull />}>
          <ShipModel />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}

// Orbit + zoom controls that keep the (moving) ship at the centre. The user can
// drag to rotate and scroll to zoom; the target auto-follows the ship's position.
function CameraRig({ stateRef }) {
  const controls = useRef();
  useFrame(() => {
    const s = stateRef.current;
    if (!s || !controls.current) return;
    const x = s.pos[0] / 10, z = -s.pos[1] / 10;
    controls.current.target.lerp(new THREE.Vector3(x, 1, z), 0.1);
    controls.current.update();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={140}
      maxPolarAngle={Math.PI / 2.05}
    />
  );
}

function Ocean() {
  const mat = useRef();
  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 } }),
    []
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <planeGeometry args={[4000, 4000, 200, 200]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={`
          uniform float uTime;
          varying float vH;
          void main() {
            vec3 p = position;
            p.z += sin(p.x * 0.08 + uTime * 1.2) * 0.35 + cos(p.y * 0.06 + uTime * 0.8) * 0.3;
            vH = p.z;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={`
          varying float vH;
          void main() {
            vec3 deep = vec3(0.02, 0.12, 0.22);
            vec3 crest = vec3(0.1, 0.35, 0.5);
            gl_FragColor = vec4(mix(deep, crest, vH * 0.9 + 0.4), 1.0);
          }
        `}
      />
    </mesh>
  );
}

function Buoys() {
  const buoys = [
    { p: [30, 6], c: "#d32f2f" }, { p: [30, -6], c: "#2fbf4f" },
    { p: [60, 5], c: "#d32f2f" }, { p: [60, -5], c: "#2fbf4f" },
  ];
  return buoys.map((b, i) => (
    <mesh key={i} position={[b.p[0], 0.6, -b.p[1]]}>
      <cylinderGeometry args={[0.4, 0.5, 1.4]} />
      <meshStandardMaterial color={b.c} />
    </mesh>
  ));
}

export default function Scene({ stateRef }) {
  return (
    <Canvas camera={{ position: [-30, 14, 0], fov: 55 }} style={{ position: "absolute", inset: 0 }}>
      <Sky sunPosition={[100, 30, 100]} turbidity={6} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[80, 60, 40]} intensity={1.4} />
      <Ocean />
      <Buoys />
      <Ship stateRef={stateRef} />
      <CameraRig stateRef={stateRef} />
      <Environment preset="sunset" />
    </Canvas>
  );
}

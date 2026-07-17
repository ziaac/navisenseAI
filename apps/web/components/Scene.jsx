"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Sky, useGLTF, OrbitControls, Clouds, Cloud } from "@react-three/drei";
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
          varying float vDist;
          void main() {
            vec3 p = position;
            p.z += sin(p.x * 0.08 + uTime * 1.2) * 0.35 + cos(p.y * 0.06 + uTime * 0.8) * 0.3;
            vH = p.z;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `}
        fragmentShader={`
          varying float vH;
          varying float vDist;
          void main() {
            // ocean blue-teal, lighter than before
            vec3 deep  = vec3(0.05, 0.24, 0.38);
            vec3 crest = vec3(0.18, 0.48, 0.60);
            vec3 col = mix(deep, crest, vH * 0.9 + 0.45);
            // atmospheric blend into the sky near the horizon
            vec3 horizon = vec3(0.66, 0.78, 0.85);
            col = mix(col, horizon, smoothstep(200.0, 1500.0, vDist));
            gl_FragColor = vec4(col, 1.0);
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
    <Canvas camera={{ position: [-19, 6.5, 0], fov: 55 }} style={{ position: "absolute", inset: 0 }}>
      <Sky sunPosition={[100, 30, 100]} turbidity={6} />
      <Clouds material={THREE.MeshBasicMaterial}>
        <Cloud seed={2} segments={24} bounds={[70, 8, 45]} volume={38} position={[90, 55, -160]} color="#ffffff" opacity={0.5} speed={0.08} fade={60} />
        <Cloud seed={7} segments={22} bounds={[60, 7, 40]} volume={32} position={[-150, 62, -70]} color="#f4f8fb" opacity={0.42} speed={0.06} fade={60} />
        <Cloud seed={13} segments={20} bounds={[55, 6, 40]} volume={30} position={[30, 58, 170]} color="#ffffff" opacity={0.45} speed={0.07} fade={60} />
        <Cloud seed={21} segments={18} bounds={[45, 6, 35]} volume={26} position={[190, 60, 40]} color="#f4f8fb" opacity={0.38} speed={0.05} fade={60} />
      </Clouds>
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

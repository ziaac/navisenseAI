"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Sky, useGLTF, OrbitControls, Clouds, Cloud, useProgress } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const SHIP_GLB = "/tanker.glb"; // player vessel (oil tanker)
// Aligns the model's bow with +X (sim bow at yaw 0). The tanker mesh is baked
// DIAGONALLY in model space: PCA of its vertices puts the hull axis at 39.8deg
// off +X (after a 90deg base turn), superstructure aft — hence this odd angle.
const SHIP_MODEL_YAW = Math.PI / 2 + (39.8 * Math.PI) / 180;
// visual draft: sink the hull so the waterline sits above the propeller
const SHIP_DRAFT = -0.55;

class ModelBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback !== undefined ? this.props.fallback : <FallbackHull />;
  }
}

function ShipModel() {
  const { scene } = useGLTF(SHIP_GLB);
  const s = useMemo(() => {
    const c = scene.clone();
    c.traverse((o) => { o.castShadow = true; });
    return c;
  }, [scene]);
  return (
    <group rotation={[0, SHIP_MODEL_YAW, 0]}>
      <primitive object={s} />
    </group>
  );
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
    group.current.position.set(s.pos[0] / 10, SHIP_DRAFT, -s.pos[1] / 10);
    group.current.rotation.y = s.yaw_rad;
  });
  return (
    <group ref={group} scale={1.25}>
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
// Publishes the camera's view bearing (nav convention) into viewRef for the compass.
function CameraRig({ stateRef, viewRef, panMode, resetTick }) {
  const controls = useRef();
  const dir = useMemo(() => new THREE.Vector3(), []);
  // snap back to the default stern view when the sim is reset, otherwise the
  // camera stays where the ship USED to be and the reset looks broken
  useEffect(() => {
    const c = controls.current;
    if (!c || !resetTick) return;
    c.object.position.set(-13.5, 6.5, 0);
    c.target.set(0, 1, 0);
    c.update();
  }, [resetTick]);
  // hand tool: left-drag pans over the water instead of orbiting, and the
  // camera stops chasing the ship until pan mode is switched off again
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.mouseButtons.LEFT = panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    c.touches.ONE = panMode ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  }, [panMode]);
  useFrame(({ camera }) => {
    if (viewRef) {
      camera.getWorldDirection(dir);
      // scene: +x = East, -z = North  ->  bearing 0..360
      viewRef.current = (Math.atan2(dir.x, -dir.z) * 180 / Math.PI + 360) % 360;
    }
    const s = stateRef.current;
    if (!s || !controls.current) return;
    if (!panMode) {
      const x = s.pos[0] / 10, z = -s.pos[1] / 10;
      controls.current.target.lerp(new THREE.Vector3(x, 1, z), 0.1);
    }
    controls.current.update();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={panMode}
      screenSpacePanning={false}
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
          varying vec2 vPos;
          varying vec3 vWorld;
          void main() {
            vec3 p = position;
            // three overlapping wave trains at different angles + small chop
            float h = sin(p.x * 0.08 + uTime * 1.2) * 0.30
                    + cos(p.y * 0.06 + uTime * 0.8) * 0.26
                    + sin((p.x * 0.71 + p.y * 0.70) * 0.045 + uTime * 0.55) * 0.22
                    + sin((p.x - p.y) * 0.21 + uTime * 1.9) * 0.06;
            p.z += h;
            vH = h;
            vPos = position.xy;
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vWorld = wp.xyz;
            vec4 mv = viewMatrix * wp;
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying float vH;
          varying float vDist;
          varying vec2 vPos;
          varying vec3 vWorld;
          // precision-safe hash + smooth value noise (soft organic blobs)
          float hash(vec2 p) {
            p = fract(p * 0.3183099 + vec2(0.1, 0.7)) * 17.0;
            return fract(p.x * p.y * (p.x + p.y));
          }
          float noise(vec2 x) {
            vec2 i = floor(x), f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                       mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
          }
          void main() {
            // per-pixel surface normal from screen-space derivatives + ripple detail
            vec3 dx = dFdx(vWorld), dy = dFdy(vWorld);
            vec3 N = normalize(cross(dx, dy));
            if (N.y < 0.0) N = -N;
            vec2 rq = mod(vPos, 256.0) * 1.6 + vec2(uTime * 0.6, uTime * 0.45);
            float r1 = noise(rq) - 0.5, r2 = noise(rq * 2.3 + 17.0) - 0.5;
            N = normalize(N + vec3(r1 * 0.22, 0.0, r2 * 0.22));

            vec3 V = normalize(cameraPosition - vWorld);
            vec3 L = normalize(vec3(0.55, 0.42, 0.28)); // matches key light
            vec3 skyTint = vec3(0.63, 0.76, 0.85);

            // water body colour: deep blue base, teal in wave crests
            vec3 deep  = vec3(0.02, 0.16, 0.30);
            vec3 crest = vec3(0.10, 0.42, 0.52);
            vec3 col = mix(deep, crest, clamp(vH * 0.9 + 0.5, 0.0, 1.0));

            // fresnel: grazing angles reflect the sky
            float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            col = mix(col, skyTint, fres * 0.55);

            // sun glint: tight specular + broader sheen along the light path
            vec3 H = normalize(L + V);
            float ndh = max(dot(N, H), 0.0);
            float glint = pow(ndh, 240.0) * 1.2 + pow(ndh, 48.0) * 0.18;
            col += vec3(1.0, 0.95, 0.82) * glint;

            // sparse soft foam wisps on wave crests (visual only)
            vec2 q = mod(vPos, 512.0) * 0.7 + vec2(uTime * 0.22, -uTime * 0.16);
            float n = noise(q) * 0.65 + noise(q * 2.7) * 0.35;
            float foam = smoothstep(0.25, 0.55, vH) * smoothstep(0.62, 0.85, n);
            col = mix(col, vec3(0.90, 0.95, 0.97), foam * 0.4);

            // atmospheric blend into the sky near the horizon (far only, or
            // nearby objects look like they float on sky-coloured water)
            vec3 horizon = vec3(0.66, 0.78, 0.85);
            col = mix(col, horizon, smoothstep(700.0, 1900.0, vDist));
            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
}

// Sim metres -> scene units (1:10); scene x = sim x, scene z = -sim y.
const M = (v) => v / 10;
const yawFromHeading = (deg) => THREE.MathUtils.degToRad(90 - deg);

function BuoyFallback({ color }) {
  return (
    <mesh position={[0, 0.6, 0]}>
      <cylinderGeometry args={[0.4, 0.5, 1.4]} />
      <meshStandardMaterial color={color === "red" ? "#d32f2f" : "#2fbf4f"} />
    </mesh>
  );
}

function Buoys({ world }) {
  const buoys = world?.buoys ?? [
    { id: "d1", x: 300, y: 60, color: "red" }, { id: "d2", x: 300, y: -60, color: "green" },
    { id: "d3", x: 600, y: 50, color: "red" }, { id: "d4", x: 600, y: -50, color: "green" },
  ];
  return buoys.map((b) => (
    <group key={b.id} position={[M(b.x), 0, -M(b.y)]}>
      <ModelBoundary fallback={<BuoyFallback color={b.color} />}>
        <Suspense fallback={<BuoyFallback color={b.color} />}>
          <ObstacleModel url={b.color === "red" ? "/redbuoy.glb" : "/greenbuoy.glb"} scale={0.06} />
        </Suspense>
      </ModelBoundary>
    </group>
  ));
}

const OBSTACLE_MODELS = {
  island: "/island.glb",
  cargoship: "/ship.glb",
  smallship: "/boat.glb",
  tanker: "/tanker.glb",
};

function ObstacleModel({ url, scale = 1 }) {
  const { scene } = useGLTF(url);
  const s = useMemo(() => {
    const c = scene.clone();
    // some assets ship with very high metalness and read almost black on
    // open water — soften so they pick up sun and sky light
    c.traverse((o) => {
      if (o.isMesh && o.material) {
        if (o.material.metalness !== undefined && o.material.metalness > 0.3) {
          o.material = o.material.clone();
          o.material.metalness = 0.25;
        }
        o.material.envMapIntensity = 1.8;
      }
    });
    return c;
  }, [scene]);
  return <primitive object={s} scale={scale} />;
}

function Obstacles({ world }) {
  if (!world?.obstacles) return null;
  return world.obstacles.map((ob) => (
    <group
      key={ob.id}
      // islands sink so their baked sea-skirt stays under the waves; ships get
      // a visual draft so they don't float keel-dry
      position={[M(ob.x), { island: -2.5, cargoship: -0.8 }[ob.type] ?? 0, -M(ob.y)]}
      rotation={[0, yawFromHeading(ob.heading_deg || 0), 0]}
    >
      <ModelBoundary fallback={null}>
        <Suspense fallback={null}>
          <ObstacleModel url={OBSTACLE_MODELS[ob.type] ?? `/${ob.type}.glb`} scale={ob.scale ?? 1} />
        </Suspense>
      </ModelBoundary>
    </group>
  ));
}

// Moving traffic — position comes with every state frame, applied without re-render.
function Traffic({ stateRef }) {
  const group = useRef();
  useFrame(() => {
    const tr = stateRef.current?.traffic?.[0];
    if (!tr || !group.current) return;
    group.current.position.set(M(tr.x), 0, -M(tr.y));
    group.current.rotation.y = yawFromHeading(tr.heading_deg);
  });
  return (
    <group ref={group} position={[M(500), 0, -M(-350)]}>
      <ModelBoundary fallback={null}>
        <Suspense fallback={null}>
          <ObstacleModel url="/boat.glb" />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}

// Progress overlay while glb assets stream in, so the empty ocean is not
// mistaken for the finished scene.
function AssetLoader() {
  const { active, progress, item } = useProgress();
  if (!active) return null;
  const pct = Math.min(99, Math.round(progress));
  return (
    <div className="asset-loader">
      <div className="asset-loader-label">LOADING VESSELS… {pct}%</div>
      <div className="asset-loader-bar">
        <div className="asset-loader-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Scene({ stateRef, viewRef, world, panMode, resetTick }) {
  return (
    <>
    <AssetLoader />
    <Canvas camera={{ position: [-13.5, 6.5, 0], fov: 55 }} style={{ position: "absolute", inset: 0 }}>
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
      <Buoys world={world} />
      <Obstacles world={world} />
      <Traffic stateRef={stateRef} />
      <Ship stateRef={stateRef} />
      <CameraRig stateRef={stateRef} viewRef={viewRef} panMode={panMode} resetTick={resetTick} />
      <Environment preset="sunset" />
    </Canvas>
    </>
  );
}

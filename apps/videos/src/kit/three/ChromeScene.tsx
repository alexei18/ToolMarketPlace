import { useEnvironment } from "@react-three/drei";
import { useLoader, useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { ToneMappingMode } from "postprocessing";
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KIT } from "../tokens";
import { cameraPose, type CameraPreset } from "./camera";

/** World units per SVG unit of the logo files. */
const UNIT = 1 / 1000;
const HDRI = "hdri/studio_small_09_2k.hdr";

export interface ChromePiece {
  geometry: THREE.BufferGeometry;
  /** The path's fill in the file: the brand green becomes green-tinted chrome, the rest silver. */
  green: boolean;
}

/**
 * Smoothing bends the normals across the big triangles of the front and back faces, and chrome shows
 * every triangle. The faces stay exactly flat; only the bevels are smooth.
 */
function flatCaps(smooth: THREE.BufferGeometry, raw: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = raw.index ? raw.toNonIndexed() : raw;
  flat.computeVertexNormals();
  const faceN = flat.getAttribute("normal");
  const out = smooth.getAttribute("normal");
  for (let i = 0; i < out.count; i += 3) {
    const nz = faceN.getZ(i);
    if (Math.abs(nz) < 0.9995) continue;
    for (let v = 0; v < 3; v++) out.setXYZ(i + v, 0, 0, Math.sign(nz));
  }
  return smooth;
}

/** The logo's own paths, extruded with a bevel. The outline stays the file's: the bevel grows inward. */
export function useChromePieces(svgUrl: string, depth: number, bevel: number): ChromePiece[] {
  const svg = useLoader(SVGLoader, svgUrl);
  return useMemo(() => {
    const pieces = svg.paths.map((path) => {
      const shapes = SVGLoader.createShapes(path).map((s) => {
        // SVG y grows down; three's grows up. Flip the points, not the mesh, so the normals stay right.
        const flip = (pts: THREE.Vector2[]) => pts.map((p) => new THREE.Vector2(p.x * UNIT, -p.y * UNIT));
        const shape = new THREE.Shape(flip(s.getPoints(16)));
        shape.holes = s.holes.map((h) => new THREE.Path(flip(h.getPoints(16))));
        return shape;
      });
      const raw = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 10, curveSegments: 16 });
      const geometry = flatCaps(toCreasedNormals(raw, 0.6), raw);
      geometry.computeBoundingBox();
      return { geometry, green: path.color.getHex() === new THREE.Color("#0E7A4F").getHex() };
    });
    // Center on x and z, standing on the floor.
    const box = new THREE.Box3();
    for (const p of pieces) box.union(p.geometry.boundingBox!);
    const c = box.getCenter(new THREE.Vector3());
    for (const p of pieces) p.geometry.translate(-c.x, -box.min.y, -c.z);
    return pieces;
  }, [svg, depth, bevel]);
}

/**
 * `soft`: flat faces this small mirror one patch of the studio and read as plain gray, so on the
 * letters the normals bend in soft waves: bands of reflection run across them, as on curved chrome.
 */
/** Polished chrome, lit by the HDRI (turning slowly, so the reflections slide; the floor doesn't get it). The sweep is a band of light crossing the object in world space, frame-driven. */
export const ChromeMaterial: React.FC<{ green: boolean; sweep?: number | null; reflection?: boolean; soft?: boolean }> = ({ green, sweep = null, reflection = false, soft = false }) => {
  const env = useEnvironment({ files: staticFile(HDRI) });
  const frame = useCurrentFrame();
  const uniforms = useMemo(() => ({ uSweep: { value: 0 }, uSweepOn: { value: 0 } }), []);
  uniforms.uSweep.value = sweep ?? 0;
  uniforms.uSweepOn.value = sweep === null ? 0 : 1;
  const onBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uSweep = uniforms.uSweep;
      shader.uniforms.uSweepOn = uniforms.uSweepOn;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
        .replace("#include <fog_vertex>", "#include <fog_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;\nuniform float uSweep;\nuniform float uSweepOn;")
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\nfloat band = smoothstep(0.16, 0.0, abs(vWorld.x + 0.55 * vWorld.y - uSweep));\ntotalEmissiveRadiance += uSweepOn * band * band * vec3(2.6);",
        )
        .replace(
          "#include <normal_fragment_maps>",
          soft ? "#include <normal_fragment_maps>\nnormal = normalize(normal + vec3(0.07 * sin(vWorld.x * 7.0 + vWorld.y * 3.0), 0.17 * sin(vWorld.y * 15.0 + vWorld.x * 2.0), 0.0));" : "#include <normal_fragment_maps>",
        )
        .replace("#include <opaque_fragment>", "#include <opaque_fragment>\nif (vWorld.y < 0.0) gl_FragColor.rgb *= 0.34 * exp(vWorld.y * 3.2);");
    },
    [uniforms, soft],
  );
  return <meshStandardMaterial metalness={1} roughness={soft ? 0.09 : reflection ? 0.22 : green ? 0.1 : 0.07} color={green ? "#7fe0b4" : "#e4e6e8"} envMap={env} envMapRotation={[0, 0.6 + frame * 0.004, 0]} envMapIntensity={soft ? 1.7 : 1.15} onBeforeCompile={onBeforeCompile} />;
};

/** Which GPU this tab got: on a laptop with two, ANGLE may pick the slow one. */
const logRenderer = ({ gl }: { gl: THREE.WebGLRenderer }) => {
  const c = gl.getContext();
  const info = c.getExtension("WEBGL_debug_renderer_info");
  if (info) console.info(`WebGL renderer: ${c.getParameter(info.UNMASKED_RENDERER_WEBGL)}`);
};

const SpinGroups = createContext<(THREE.Group | null)[]>([]);

/** The object and, flipped under the floor, its reflection: fading with depth, softened by the depth of field. The floor itself stays black. */
export const Mirrored: React.FC<{ spin: number; children: (reflection: boolean) => React.ReactNode }> = ({ spin, children }) => {
  const groups = useContext(SpinGroups);
  return (
    <>
      <group ref={(g) => void (groups[0] = g)} rotation={[0, spin, 0]}>
        {children(false)}
      </group>
      <group ref={(g) => void (groups[1] = g)} scale={[1, -1, 1]} rotation={[0, spin, 0]}>
        {children(true)}
      </group>
    </>
  );
};

const Camera: React.FC<{ preset: CameraPreset; t: number }> = ({ preset, t }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const pose = cameraPose(preset, t);
  useLayoutEffect(() => {
    camera.position.set(...pose.position);
    camera.fov = pose.fov;
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
  });
  return null;
};

type Composer = { passes: unknown[]; render: (delta: number) => void };

/** Sub-frame samples and shutter (180°) for the frames where the object spins fast. */
const BLUR_SAMPLES = 8;
const BLUR_SHUTTER = 0.5;
/** Radians per frame above which a spin counts as fast. */
const BLUR_FROM = 0.012;

/**
 * Two jobs after the scene is drawn.
 * The composer builds itself over several React updates after mount, and until then its frame loop
 * draws nothing: the first frame of a tab would be black. Hold that frame until the passes are
 * attached, then draw it. Later frames are drawn by ThreeCanvas's own advance.
 * On a fast spin, also draw sub-frame samples and average them on the overlay canvas: motion blur on
 * the one object that needs it, without duplicating the whole WebGL scene per sample.
 */
const AfterDraw: React.FC<{ composer: React.RefObject<Composer | null>; overlay: React.RefObject<HTMLCanvasElement | null>; spinAt: (frame: number) => number }> = ({ composer, overlay, spinAt }) => {
  const advance = useThree((s) => s.advance);
  const gl = useThree((s) => s.gl);
  const groups = useContext(SpinGroups);
  const { delayRender, continueRender } = useDelayRender();
  const ready = useRef(false);
  const frame = useCurrentFrame();

  const blur = () => {
    const canvas = overlay.current;
    if (!canvas || !composer.current) return;
    const fast = Math.abs(spinAt(frame + 1) - spinAt(frame)) > BLUR_FROM;
    canvas.style.display = fast ? "block" : "none";
    if (!fast) return;
    const ctx = canvas.getContext("2d")!;
    for (let i = 0; i < BLUR_SAMPLES; i++) {
      const spin = spinAt(frame + (BLUR_SHUTTER * i) / (BLUR_SAMPLES - 1));
      for (const g of groups) g?.rotation.set(0, spin, 0);
      composer.current.render(0);
      ctx.globalAlpha = 1 / (i + 1);
      ctx.drawImage(gl.domElement, 0, 0);
    }
  };

  useLayoutEffect(() => {
    if (ready.current) return;
    const handle = delayRender("Waiting for the effect composer");
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      // The render pass alone is there first; the effect passes follow.
      if ((composer.current?.passes.length ?? 0) > 1) {
        ready.current = true;
        advance(performance.now());
        blur();
        continueRender(handle);
      } else {
        timer = setTimeout(check, 10);
      }
    };
    check();
    return () => {
      clearTimeout(timer);
      if (!ready.current) continueRender(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);
  // After ThreeCanvas's own advance (its effect runs first).
  useEffect(() => {
    if (ready.current) blur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);
  return null;
};

export interface ChromeSceneProps {
  camera: CameraPreset;
  durationInFrames: number;
  children: (spin: number) => React.ReactNode;
}

/** Studio chrome on black, with depth of field and a subtle bloom. Reflections come from <Mirrored>. */
export const ChromeScene: React.FC<ChromeSceneProps> = ({ camera, durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = durationInFrames > 1 ? Math.min(1, Math.max(0, frame / (durationInFrames - 1))) : 0;
  const pose = cameraPose(camera, t);
  const composer = useRef<Composer | null>(null);
  const overlay = useRef<HTMLCanvasElement | null>(null);
  const groups = useMemo<(THREE.Group | null)[]>(() => [null, null], []);
  const spinAt = (f: number) => cameraPose(camera, durationInFrames > 1 ? Math.min(1, Math.max(0, f / (durationInFrames - 1))) : 0).spin;
  return (
    <>
    <ThreeCanvas width={width} height={height} camera={{ fov: 30, near: 0.05, far: 60 }} gl={{ antialias: false }} onCreated={logRenderer}>
      <color attach="background" args={[KIT.bg]} />
      <Camera preset={camera} t={t} />
      <SpinGroups.Provider value={groups}>{children(pose.spin)}</SpinGroups.Provider>
      <EffectComposer ref={composer as never} multisampling={4}>
        <DepthOfField worldFocusDistance={pose.focus} worldFocusRange={camera === "macroGlide" ? 0.25 : 1.1} bokehScale={camera === "macroGlide" ? 5 : 2.5} />
        <Bloom intensity={0.28} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
      <SpinGroups.Provider value={groups}>
        <AfterDraw composer={composer} overlay={overlay} spinAt={spinAt} />
      </SpinGroups.Provider>
    </ThreeCanvas>
    <canvas ref={overlay} width={width} height={height} style={{ position: "absolute", left: 0, top: 0, width, height, display: "none" }} />
    </>
  );
};

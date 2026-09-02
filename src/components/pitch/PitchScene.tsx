"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { WebGPUBackend, WebGPURenderer } from "three/webgpu";
import { Bloom } from "./Bloom";
import { CameraRig } from "./CameraRig";
import { PitchCards } from "./PitchCards";
import { PitchFallback } from "./PitchFallback";
import { SlotMarkers } from "./SlotMarkers";
import { Floodlights, Grass, Stands } from "./Stadium";

export type Backend = "webgpu" | "webgl" | "none";

interface PitchSceneProps {
  onBackend?: (backend: Backend) => void;
  onReady?: () => void;
}

/**
 * The stadium. WebGPU where the browser has it, WebGL2 through the same node renderer where it does not,
 * and a flat CSS pitch when neither is available or the renderer throws.
 */
export function PitchScene({ onBackend, onReady }: PitchSceneProps) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const readySent = useRef(false);
  const onBackendRef = useRef(onBackend);
  onBackendRef.current = onBackend;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const markReady = () => {
    if (readySent.current) return;
    readySent.current = true;
    setReady(true);
    onReadyRef.current?.();
  };

  useEffect(() => {
    if (failed || !hasWebGL()) {
      onBackendRef.current?.("none");
      markReady();
    }
  }, [failed]);

  if (failed || typeof window === "undefined" || !hasWebGL()) {
    return <PitchFallback />;
  }

  return (
    <SceneBoundary
      onError={() => {
        setFailed(true);
        onBackendRef.current?.("none");
        markReady();
      }}
    >
      {/*
        Keep the canvas at full opacity so the browser actually submits WebGPU frames.
        Cover it with the CSS pitch until pipelines have compiled and two frames have landed.
      */}
      <div className="absolute inset-0">
        <Canvas
          dpr={[1, 1.6]}
          camera={{ fov: 37, near: 0.5, far: 90, position: [0, 9.9, 12.4] }}
          gl={async ({ canvas }) => {
            if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Draft Room renders to a DOM canvas only");
            const renderer = new WebGPURenderer({
              canvas,
              antialias: true,
              alpha: false,
              powerPreference: "high-performance",
            });
            await renderer.init();
            renderer.toneMapping = ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.05;
            renderer.outputColorSpace = SRGBColorSpace;
            onBackendRef.current?.(renderer.backend instanceof WebGPUBackend ? "webgpu" : "webgl");
            return renderer;
          }}
          style={{ position: "absolute", inset: 0, zIndex: 0 }}
        >
          <color attach="background" args={["#060810"]} />
          <fogExp2 attach="fog" args={["#060810", 0.015]} />
          <hemisphereLight args={["#2a3556", "#05070c", 0.7]} />
          <ambientLight intensity={0.12} color="#8fa3ff" />
          <SceneContent onReady={markReady} />
        </Canvas>
      </div>
      {!ready && (
        <div className="absolute inset-0 z-10">
          <PitchFallback skeleton />
        </div>
      )}
    </SceneBoundary>
  );
}

function SceneContent({ onReady }: { onReady: () => void }) {
  const size = useThree((s) => s.size);
  const portrait = size.width < size.height * 1.05;
  const distanceFactor = portrait ? 4.2 : Math.min(4.7, Math.max(3.9, size.width / 220));

  return (
    <>
      <CameraRig portrait={portrait} />
      <Grass />
      <Stands />
      <Floodlights />
      <SlotMarkers />
      <PitchCards distanceFactor={distanceFactor} />
      <Bloom enabled />
      <FirstFrame onReady={onReady} />
    </>
  );
}

/** Holds the CSS cover until the GPU has compiled and presented the grass. */
function FirstFrame({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [compiled, setCompiled] = useState(false);
  const frames = useRef(0);
  const sent = useRef(false);

  useEffect(() => {
    let gone = false;
    const timeout = window.setTimeout(() => {
      if (!gone) setCompiled(true);
    }, 8000);
    void (async () => {
      if (gl instanceof WebGPURenderer) {
        try {
          await gl.compileAsync(scene, camera);
        } catch {
          // First frames still try; the timeout still lifts the CSS cover.
        }
      }
      if (!gone) setCompiled(true);
    })();
    return () => {
      gone = true;
      window.clearTimeout(timeout);
    };
  }, [camera, gl, scene]);

  useFrame(() => {
    if (!compiled || sent.current) return;
    frames.current += 1;
    if (frames.current < 2) return;
    sent.current = true;
    onReadyRef.current();
  });

  return null;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? <PitchFallback /> : this.props.children;
  }
}

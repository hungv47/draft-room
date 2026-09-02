"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { pass } from "three/tsl";
import { RenderPipeline, WebGPURenderer } from "three/webgpu";

/**
 * Bloom on the floodlight heads, pitch lines and slot rings. Runs through three's node-based
 * PostProcessing so it works on both the WebGPU and the WebGL2 backends. Takes over the frame loop.
 */
export function Bloom({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const post = useMemo(() => {
    if (!enabled || !(gl instanceof WebGPURenderer)) return null;
    const processing = new RenderPipeline(gl);
    const scenePass = pass(scene, camera);
    const colour = scenePass.getTextureNode("output");
    const glow = bloom(colour, 0.32, 0.35, 0.85);
    processing.outputNode = colour.add(glow);
    return processing;
  }, [enabled, gl, scene, camera]);

  useEffect(() => () => post?.dispose(), [post]);

  useFrame(() => {
    if (post) post.render();
    else gl.render(scene, camera);
  }, 1);

  return null;
}

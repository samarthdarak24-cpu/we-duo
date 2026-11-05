"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useThemeColors } from "@/components/theme/ThemeProvider";

const TOTAL_FRAMES = 291;
const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;

function getFrameUrl(index: number): string {
  const padded = String(index + 1).padStart(3, "0");
  return `/frames/ezgif-frame-${padded}.jpg`;
}

export function ScrollCarAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const currentFrameRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const colors = useThemeColors();
  const canvasColorRef = useRef(colors.canvas);
  canvasColorRef.current = colors.canvas;

  // Render a specific frame onto the canvas with proper aspect-ratio containment
  const drawFrame = (frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Find requested image or nearest available loaded frame to prevent blank frames
    let img = imagesRef.current[frameIndex];
    if (!img || !img.complete || img.naturalWidth === 0) {
      // Find nearest loaded frame
      let fallbackIndex = frameIndex;
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        if (frameIndex - offset >= 0) {
          const prev = imagesRef.current[frameIndex - offset];
          if (prev && prev.complete && prev.naturalWidth > 0) {
            fallbackIndex = frameIndex - offset;
            break;
          }
        }
        if (frameIndex + offset < TOTAL_FRAMES) {
          const next = imagesRef.current[frameIndex + offset];
          if (next && next.complete && next.naturalWidth > 0) {
            fallbackIndex = frameIndex + offset;
            break;
          }
        }
      }
      img = imagesRef.current[fallbackIndex];
    }

    if (!img || !img.complete || img.naturalWidth === 0) return;

    // Clear canvas background to the active theme's studio colour
    ctx.fillStyle = canvasColorRef.current;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Compute aspect-ratio containment (letterbox/pillarbox without distortion)
    const hRatio = canvas.width / FRAME_WIDTH;
    const vRatio = canvas.height / FRAME_HEIGHT;
    const ratio = Math.min(hRatio, vRatio);

    const drawWidth = FRAME_WIDTH * ratio;
    const drawHeight = FRAME_HEIGHT * ratio;
    const offsetX = (canvas.width - drawWidth) / 2;
    const offsetY = (canvas.height - drawHeight) / 2;

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    currentFrameRef.current = frameIndex;
  };

  const scheduleDraw = (frameIndex: number) => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      drawFrame(frameIndex);
      rafIdRef.current = null;
    });
  };

  // Resize canvas to match display resolution and device pixel ratio
  const updateCanvasSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const newWidth = Math.floor(rect.width * dpr);
    const newHeight = Math.floor(rect.height * dpr);

    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      canvas.width = newWidth;
      canvas.height = newHeight;
      scheduleDraw(currentFrameRef.current);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);

    let isMounted = true;
    const images: HTMLImageElement[] = new Array(TOTAL_FRAMES);
    imagesRef.current = images;

    // Setup canvas resolution
    updateCanvasSize();

    // 1. Immediately preload the first frame for instantaneous first paint
    const firstImg = new Image();
    firstImg.src = getFrameUrl(0);
    images[0] = firstImg;

    firstImg.onload = () => {
      if (!isMounted) return;
      setIsReady(true);
      scheduleDraw(0);
    };

    // 2. Preload remaining frames in batches to avoid network congestion
    const preloadRest = () => {
      let loaded = 1;
      for (let i = 1; i < TOTAL_FRAMES; i++) {
        const img = new Image();
        img.src = getFrameUrl(i);
        img.onload = () => {
          loaded++;
          if (loaded === TOTAL_FRAMES && isMounted) {
            ScrollTrigger.refresh();
          }
        };
        images[i] = img;
      }
    };

    // Begin background preloading
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => preloadRest(), { timeout: 1000 });
    } else {
      setTimeout(preloadRest, 100);
    }

    // 3. Setup GSAP ScrollTrigger for smooth scrubbed frame playback
    const container = containerRef.current;
    if (!container) return;

    const scrollTriggerInstance = ScrollTrigger.create({
      trigger: container,
      start: "top top",
      end: "+=2600", // Pinned scroll track length
      pin: true,
      scrub: 0.35, // Smooth inertia scrub
      anticipatePin: 1,
      onUpdate: (self) => {
        const progress = Math.max(0, Math.min(1, self.progress));
        const frameIndex = Math.min(
          TOTAL_FRAMES - 1,
          Math.max(0, Math.floor(progress * (TOTAL_FRAMES - 1)))
        );
        scheduleDraw(frameIndex);
      },
    });

    const handleResize = () => {
      updateCanvasSize();
      ScrollTrigger.refresh();
    };

    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      isMounted = false;
      window.removeEventListener("resize", handleResize);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      scrollTriggerInstance.kill();
    };
  }, []);

  // Repaint the current frame whenever the Day / Night palette changes.
  useEffect(() => {
    const id = requestAnimationFrame(() => drawFrame(currentFrameRef.current));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors.canvas]);

  return (
    <div
      ref={containerRef}
      className="theme-cinematic relative w-full h-screen bg-[#08090A] flex items-center justify-center overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain block"
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: colors.canvas,
        }}
      />
    </div>
  );
}

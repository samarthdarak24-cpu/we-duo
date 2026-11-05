"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import {
  getComponentById,
  getComponentByMeshName,
  mapZoneToComponentId,
  VEHICLE_COMPONENT_REGISTRY,
  VehicleComponentDef,
} from "@/lib/vehicle-registry";

export type VehicleViewerMode = "normal" | "exploded" | "damage" | "xray";

export interface DamageRecordItem {
  id: string;
  severity: string;
  description: string;
  repairStatus: string;
  repairDetails?: string;
  inspectionDate: string | null;
  status: string;
  photoKeys?: string[];
  repairInvoiceDocId?: string | null;
}

export interface HotspotItem {
  id: string;
  label: string;
  componentId?: string;
  position: [number, number, number];
  explosionVector?: [number, number, number];
  available?: boolean;
  unavailableReason?: string;
  damage?: DamageRecordItem[];
}

const PRIMARY_MODEL_URL = "/models/vehicles/trustdrive-sedan.glb";
const FALLBACK_MODEL_URL = "/models/car.glb";

// Local Studio Environment (no remote HDR fetch required)
function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

// Circular ground turntable pedestal
function PedestalPlatform() {
  return (
    <group position={[0, -0.01, 0]}>
      {/* Outer champagne accent ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <torusGeometry args={[3.4, 0.045, 16, 96]} />
        <meshStandardMaterial
          color="#C5A46D"
          metalness={0.9}
          roughness={0.2}
          emissive="#C5A46D"
          emissiveIntensity={0.25}
        />
      </mesh>
      {/* Inner graphite turntable plate */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[3.35, 72]} />
        <meshStandardMaterial color="#121417" roughness={0.9} metalness={0.25} />
      </mesh>
      {/* Center detail ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[1.7, 1.72, 64]} />
        <meshStandardMaterial color="#23282E" roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  );
}

interface LoadedCarScene {
  group: THREE.Group;
  nodeMap: Map<string, THREE.Object3D>;
  initialPositions: Map<string, THREE.Vector3>;
  materialsMap: Map<string, THREE.Material | THREE.Material[]>;
}

/**
 * Hook to load and configure the GLTF sedan model.
 */
function useSedanModel(onLoaded?: () => void, onError?: () => void) {
  const [data, setData] = useState<LoadedCarScene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();

    const tryLoad = (url: string, isFallback: boolean) => {
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;
          const scene = gltf.scene;

          const nodeMap = new Map<string, THREE.Object3D>();
          const initialPositions = new Map<string, THREE.Vector3>();
          const materialsMap = new Map<string, THREE.Material | THREE.Material[]>();

          scene.traverse((obj) => {
            if (obj.name) {
              nodeMap.set(obj.name, obj);
              initialPositions.set(obj.name, obj.position.clone());
            }
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              if (mesh.material) {
                materialsMap.set(mesh.uuid, mesh.material);
              }
            }
          });

          // Center bounding box on turntable origin [0, 0, 0]
          scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(scene);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          const wrap = new THREE.Group();
          // Align lowest point of tires to turntable ground plane Y = 0
          scene.position.set(-center.x, -box.min.y, -center.z);
          wrap.add(scene);

          setData({ group: wrap, nodeMap, initialPositions, materialsMap });
          setFailed(false);
          onLoaded?.();
        },
        undefined,
        (err) => {
          if (cancelled) return;
          console.warn(`Failed loading model from ${url}:`, err);
          if (!isFallback) {
            tryLoad(FALLBACK_MODEL_URL, true);
          } else {
            setFailed(true);
            onError?.();
          }
        }
      );
    };

    tryLoad(PRIMARY_MODEL_URL, false);

    return () => {
      cancelled = true;
    };
  }, [onLoaded, onError]);

  return { data, failed };
}

/**
 * 3D Car Model Node Hierarchy, Materials, and Animated Disassembly.
 * Uses strict drag discrimination to prevent false clicks during orbit navigation.
 */
function SedanModel({
  data,
  viewMode,
  explodedProgress,
  selectedComponentId,
  highlightedComponentIds,
  onSelectMesh,
}: {
  data: LoadedCarScene;
  viewMode: VehicleViewerMode;
  explodedProgress: number; // 0.0 to 1.0
  selectedComponentId: string | null;
  highlightedComponentIds: Set<string>;
  onSelectMesh: (meshName: string) => void;
}) {
  const currentExploded = useRef(0);
  const pointerStart = useRef({ x: 0, y: 0, time: 0 });
  const isDragging = useRef(false);

  // High-fidelity automotive PBR materials
  const silverCarPaint = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#CCD3DD"),
        metalness: 0.92,
        roughness: 0.18,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        reflectivity: 0.96,
      }),
    []
  );

  const damagedPaint = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#E59A30"),
        emissive: new THREE.Color("#D97706"),
        emissiveIntensity: 0.55,
        metalness: 0.85,
        roughness: 0.22,
        clearcoat: 0.9,
      }),
    []
  );

  const selectedPaint = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#E0F2FE"),
        emissive: new THREE.Color("#0284C7"),
        emissiveIntensity: 0.65,
        metalness: 0.9,
        roughness: 0.14,
        clearcoat: 1.0,
      }),
    []
  );

  const xrayGhostedGlass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#38BDF8"),
        transparent: true,
        opacity: 0.15,
        roughness: 0.1,
        metalness: 0.15,
        depthWrite: false,
      }),
    []
  );

  const xrayMechanicalSolid = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#94A3B8"),
        metalness: 0.85,
        roughness: 0.3,
      }),
    []
  );

  // Apply materials and X-Ray / Damage modes across meshes
  useEffect(() => {
    if (!data) return;

    data.nodeMap.forEach((node) => {
      node.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const comp = getComponentByMeshName(mesh.name) || getComponentByMeshName(node.name);
        const compId = comp?.id;
        const isDamaged = compId ? highlightedComponentIds.has(compId) : false;
        const isSelected = compId ? selectedComponentId === compId : false;

        if (viewMode === "xray") {
          const isExterior =
            comp?.category === "exterior_body" ||
            comp?.category === "closure" ||
            mesh.name.includes("Body") ||
            mesh.name.includes("Glass") ||
            mesh.name.includes("Windshield") ||
            mesh.name.includes("Window");
          if (isExterior) {
            mesh.material = xrayGhostedGlass;
          } else {
            mesh.material = xrayMechanicalSolid;
          }
        } else if (isSelected) {
          mesh.material = selectedPaint;
        } else if (viewMode === "damage" && isDamaged) {
          mesh.material = damagedPaint;
        } else {
          // Normal or Exploded mode: render silver paint and factory materials
          const orig = data.materialsMap.get(mesh.uuid);
          if (orig) {
            if (
              mesh.name.includes("Color1") ||
              mesh.name.includes("Hood") ||
              mesh.name.includes("Roof") ||
              mesh.name.includes("Door") ||
              mesh.name.includes("Panels")
            ) {
              mesh.material = silverCarPaint;
            } else {
              mesh.material = orig;
            }
          }
        }
      });
    });
  }, [
    data,
    viewMode,
    selectedComponentId,
    highlightedComponentIds,
    silverCarPaint,
    damagedPaint,
    selectedPaint,
    xrayGhostedGlass,
    xrayMechanicalSolid,
  ]);

  // Smooth exploded view displacement animation in useFrame
  useFrame((_, delta) => {
    if (!data) return;

    const target = viewMode === "exploded" ? explodedProgress : 0;
    currentExploded.current = THREE.MathUtils.damp(currentExploded.current, target, 8, delta);
    const e = currentExploded.current;

    const applyDisplacement = (nodeName: string, vec: [number, number, number]) => {
      const obj = data.nodeMap.get(nodeName);
      const init = data.initialPositions.get(nodeName);
      if (obj && init) {
        obj.position.set(
          init.x + vec[0] * e,
          init.y + vec[1] * e,
          init.z + vec[2] * e
        );
      }
    };

    // Displacements along the model's coordinate frame
    applyDisplacement("BodyHood", [0, -0.65, 0.45]);
    applyDisplacement("BodyRearPanelsColor1", [0, 0.65, 0.35]);
    applyDisplacement("BodyDoorLColor1", [0.75, 0, 0.05]);
    applyDisplacement("BodyDoorRColor1", [-0.75, 0, 0.05]);
    applyDisplacement("BodyRoofPanel", [0, 0, 0.75]);
    applyDisplacement("WheelFrontL", [0.65, 0, 0]);
    applyDisplacement("WheelFrontR", [-0.65, 0, 0]);
    applyDisplacement("WheelRearL", [0.65, 0, 0]);
    applyDisplacement("WheelRearR", [-0.65, 0, 0]);
    applyDisplacement("Engine", [0, -0.35, 0.45]);
    applyDisplacement("Axles", [0, 0, -0.3]);
  });

  return (
    <primitive
      object={data.group}
      onPointerDown={(e: any) => {
        pointerStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
        isDragging.current = false;
      }}
      onPointerMove={(e: any) => {
        const dist = Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y);
        if (dist > 6) {
          isDragging.current = true;
        }
      }}
      onClick={(e: any) => {
        e.stopPropagation();
        const dist = Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y);
        const duration = Date.now() - pointerStart.current.time;
        // Suppress click if the user was dragging to orbit or held down longer than 400ms
        if (isDragging.current || dist > 6 || duration > 400) {
          return;
        }
        if (e.object?.name) {
          onSelectMesh(e.object.name);
        }
      }}
    />
  );
}

/**
 * Dynamically synchronized 3D damage pin.
 * Displaces in real time with its component node during exploded disassembly.
 */
function DynamicHotspotPin({
  data,
  componentId,
  baseAnchor,
  damageCount,
  isSelected,
  label,
  onSelect,
}: {
  data: LoadedCarScene;
  componentId: string;
  baseAnchor: [number, number, number];
  damageCount: number;
  isSelected: boolean;
  label: string;
  onSelect: () => void;
}) {
  const pinRef = useRef<THREE.Group>(null);
  const compDef = useMemo(() => getComponentById(componentId), [componentId]);

  useFrame(() => {
    if (!pinRef.current || !data) return;
    const nodeName = compDef?.primaryNode;
    if (nodeName) {
      const node = data.nodeMap.get(nodeName);
      const init = data.initialPositions.get(nodeName);
      if (node && init) {
        // Delta displacement from initial position
        const dx = node.position.x - init.x;
        const dy = node.position.y - init.y;
        const dz = node.position.z - init.z;
        // Transform local displacement to world coordinates (BodyUnderside has -90 X rotation)
        const worldDx = dx;
        const worldDy = dz;
        const worldDz = -dy;
        pinRef.current.position.set(
          baseAnchor[0] + worldDx,
          baseAnchor[1] + worldDy,
          baseAnchor[2] + worldDz
        );
        return;
      }
    }
    pinRef.current.position.set(baseAnchor[0], baseAnchor[1], baseAnchor[2]);
  });

  return (
    <group ref={pinRef}>
      <Html center distanceFactor={6.5} className="pointer-events-none select-none">
        <div className="group relative pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            aria-label={`${label} (${damageCount} damage records)`}
            className={cn(
              "relative flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-125 focus:outline-none",
              isSelected && "scale-125 ring-2 ring-primary ring-offset-2 ring-offset-black"
            )}
          >
            {/* Warning ping animation */}
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F59E0B] opacity-50" />
            {/* Amber pill badge with record count */}
            <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-black/80 bg-[#F59E0B] text-[11px] font-bold text-black shadow-lg">
              {damageCount}
            </span>
          </button>

          {/* Clean hover tooltip */}
          <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-[#23262A] bg-[#111315]/95 px-2.5 py-0.5 text-[10.5px] font-semibold text-white shadow-xl group-hover:block">
            {label} · {damageCount} damage item{damageCount === 1 ? "" : "s"}
          </span>
        </div>
      </Html>
    </group>
  );
}

// Camera Preset Orientations
const CAMERA_PRESETS: Record<
  string,
  { label: string; position: [number, number, number]; target: [number, number, number] }
> = {
  hero: { label: "3/4 Hero", position: [4.4, 2.2, 4.4], target: [0, 0.48, 0] },
  front: { label: "Front", position: [0, 1.3, 5.2], target: [0, 0.48, 0] },
  side: { label: "Side Profile", position: [5.2, 1.2, 0], target: [0, 0.48, 0] },
  rear: { label: "Rear Tail", position: [0, 1.4, -5.2], target: [0, 0.48, 0] },
  top: { label: "Top Down", position: [0, 6.2, 0.1], target: [0, 0.48, 0] },
  engine: { label: "Powertrain", position: [1.8, 2.4, 2.6], target: [0, 0.55, 1.2] },
};

export interface VehicleViewer3DProps {
  mode?: "buyer" | "seller";
  vehicleId?: string;
  hotspots?: HotspotItem[];
  height?: number | string;
  initialViewMode?: VehicleViewerMode;
  onSelectComponent?: (comp: VehicleComponentDef | null) => void;
  className?: string;
}

export function VehicleViewer3D({
  mode = "buyer",
  vehicleId,
  hotspots = [],
  height = 580,
  initialViewMode = "normal",
  onSelectComponent,
  className,
}: VehicleViewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Viewer modes
  const [viewMode, setViewMode] = useState<VehicleViewerMode>(initialViewMode);
  const [explodedProgress, setExplodedProgress] = useState(1.0);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [activePreset, setActivePreset] = useState<string>("hero");

  // Selection & model status
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const { data } = useSedanModel(
    () => setModelReady(true),
    () => setModelFailed(true)
  );

  // Extract set of component IDs that have recorded damage
  const damagedComponentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const h of hotspots) {
      if ((h.damage?.length ?? 0) > 0) {
        const canonical = mapZoneToComponentId(h.componentId || h.id);
        ids.add(canonical);
      }
    }
    return ids;
  }, [hotspots]);

  // List of all damaged components for quick switching in the inspector & toolbar
  const damagedHotspotsList = useMemo(() => {
    return hotspots.filter((h) => (h.damage?.length ?? 0) > 0);
  }, [hotspots]);

  // Active selected component definition and its damage records
  const activeComponent = useMemo(() => {
    if (!selectedComponentId) return null;
    return getComponentById(selectedComponentId) ?? null;
  }, [selectedComponentId]);

  const activeHotspot = useMemo(() => {
    if (!selectedComponentId) return null;
    return (
      hotspots.find(
        (h) =>
          h.id === selectedComponentId ||
          mapZoneToComponentId(h.componentId || h.id) === selectedComponentId
      ) ?? null
    );
  }, [hotspots, selectedComponentId]);

  // Smoothly apply camera presets
  const applyPreset = (key: string) => {
    setActivePreset(key);
    setAutoRotate(false);
    const p = CAMERA_PRESETS[key];
    const ctrl = controlsRef.current;
    if (ctrl && p) {
      ctrl.target.set(p.target[0], p.target[1], p.target[2]);
      ctrl.object.position.set(p.position[0], p.position[1], p.position[2]);
      ctrl.update();
    }
  };

  // Smoothly focus camera onto the selected component
  const focusCameraOnComponent = (compId: string) => {
    const comp = getComponentById(compId);
    if (!comp || !controlsRef.current) return;
    const ctrl = controlsRef.current;
    const anchor = comp.defaultHotspotAnchor;
    setAutoRotate(false);

    // Frame camera facing the component based on its coordinates
    let camPos: [number, number, number] = [anchor[0] * 2.4, anchor[1] + 0.6, anchor[2] * 2.4];
    if (Math.abs(anchor[0]) > 0.6) {
      // Side panels (doors, wheels)
      const sign = anchor[0] > 0 ? 1 : -1;
      camPos = [sign * 3.4, anchor[1] + 0.3, anchor[2] * 0.8];
    } else if (anchor[2] > 0.8) {
      // Front (hood, bumper)
      camPos = [0, anchor[1] + 0.6, anchor[2] + 2.2];
    } else if (anchor[2] < -0.8) {
      // Rear (trunk, bumper)
      camPos = [0, anchor[1] + 0.6, anchor[2] - 2.2];
    } else {
      // Roof / interior
      camPos = [2.2, anchor[1] + 1.8, 2.2];
    }

    ctrl.target.set(anchor[0], anchor[1], anchor[2]);
    ctrl.object.position.set(camPos[0], camPos[1], camPos[2]);
    ctrl.update();
  };

  // Fullscreen / Theater mode toggles
  const toggleTheaterMode = () => {
    setTheaterMode((prev) => !prev);
  };

  const toggleNativeFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  };

  // Listen for Escape key to exit theater mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && theaterMode) {
        setTheaterMode(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [theaterMode]);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Raycast mesh selection handler
  const handleMeshSelect = useCallback(
    (meshName: string) => {
      const comp = getComponentByMeshName(meshName);
      if (comp) {
        setSelectedComponentId(comp.id);
        setIsInspectorCollapsed(false);
        onSelectComponent?.(comp);
      }
    },
    [onSelectComponent]
  );

  // Only display damage pins for components that ACTUALLY have recorded damage
  const visibleDamageHotspots = useMemo(() => {
    return hotspots.filter((h) => {
      const hasDamage = (h.damage?.length ?? 0) > 0;
      if (!hasDamage) return false;
      if (viewMode === "damage" && severityFilter !== "ALL") {
        return h.damage?.some(
          (d) => d.severity.toUpperCase() === severityFilter.toUpperCase()
        );
      }
      return true;
    });
  }, [hotspots, viewMode, severityFilter]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "theme-cinematic relative w-full select-none overflow-hidden rounded-[18px] border border-[#23262A] bg-[#0A0C0E] shadow-2xl transition-all duration-300",
        theaterMode && "fixed inset-0 z-50 rounded-none border-0 h-screen w-screen",
        fullscreen && "fixed inset-0 z-50 rounded-none border-0",
        className
      )}
      style={{ height: theaterMode || fullscreen ? "100dvh" : height }}
    >
      {/* 3D WebGL Canvas with OrbitControls */}
      <div
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{
          touchAction: "none",
          background: "radial-gradient(circle at 50% 40%, #1D2127 0%, #0D0F12 62%, #070809 100%)",
        }}
      >
        <Canvas
          shadows
          camera={{ position: [4.4, 2.2, 4.4], fov: 42 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        >
          <StudioEnvironment />
          {/* Key and accent studio lighting */}
          <ambientLight intensity={0.55} />
          <hemisphereLight args={["#FFFFFF", "#181B20", 0.95]} />
          <directionalLight
            position={[6, 9, 6]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0001}
          />
          <directionalLight position={[-6, 5, -4]} intensity={0.9} color="#94A3B8" />
          <directionalLight position={[0, -2, -6]} intensity={1.2} color="#C5A46D" />

          <Suspense fallback={null}>
            {data && (
              <SedanModel
                data={data}
                viewMode={viewMode}
                explodedProgress={explodedProgress}
                selectedComponentId={selectedComponentId}
                highlightedComponentIds={damagedComponentIds}
                onSelectMesh={handleMeshSelect}
              />
            )}
          </Suspense>

          <PedestalPlatform />
          <ContactShadows position={[0, 0.01, 0]} opacity={0.42} scale={8.5} blur={2.4} far={3.8} />

          {/* Genuine DB-Backed Damage Hotspots with Synchronized 3D Physics Tracking */}
          {!modelFailed &&
            data &&
            visibleDamageHotspots.map((h) => {
              const compId = mapZoneToComponentId(h.componentId || h.id);
              const compDef = getComponentById(compId);
              const anchor = compDef?.defaultHotspotAnchor ?? h.position;
              const damageCount = h.damage?.length ?? 0;
              const isSelected = selectedComponentId === compId;

              if (compDef && !compDef.available) return null;

              return (
                <DynamicHotspotPin
                  key={h.id}
                  data={data}
                  componentId={compId}
                  baseAnchor={anchor}
                  damageCount={damageCount}
                  isSelected={isSelected}
                  label={h.label}
                  onSelect={() => {
                    setSelectedComponentId((prev) => (prev === compId ? null : compId));
                    setIsInspectorCollapsed(false);
                    onSelectComponent?.(compDef ?? null);
                    focusCameraOnComponent(compId);
                  }}
                />
              );
            })}

          {/* Smooth OrbitControls with Damping and Polar Angle Floor Guard */}
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.8}
            zoomSpeed={0.85}
            minDistance={2.4}
            maxDistance={12.0}
            maxPolarAngle={Math.PI / 2 - 0.02}
            minPolarAngle={0.08}
            target={[0, 0.48, 0]}
            autoRotate={autoRotate}
            autoRotateSpeed={1.2}
          />
        </Canvas>

        {/* Loading Overlay */}
        {!modelReady && !modelFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#08090A]/85 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-full border border-[#23262A] bg-[#111315]/95 px-5 py-2.5 text-[12.5px] font-medium text-[#F5F5F5] shadow-2xl">
              <Icon name="Loader2" size={17} className="animate-spin text-primary" />
              <span>Loading Executive Sedan 3D Geometry…</span>
            </div>
            <p className="mt-2 text-[11px] font-mono text-[#7A8089]">
              Khronos CC BY 4.0 PBR Vehicle Model
            </p>
          </div>
        )}

        {/* Failure Overlay */}
        {modelFailed && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#08090A]/95">
            <div className="max-w-md rounded-2xl border border-red-900/40 bg-[#141619] p-6 text-center shadow-2xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-950/60 text-red-400">
                <Icon name="AlertTriangle" size={24} />
              </div>
              <h3 className="mt-3 text-[15px] font-bold text-white">Automotive 3D Asset Offline</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#9299A2]">
                The GLB vehicle geometry could not be parsed by this browser session. Verified database damage records remain accessible in the tables below.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* TOP BAR: Header & Mode Pills */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center justify-between gap-2">
        {/* Left: Studio Brand & Active Mode */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#111315]/90 px-3.5 py-1.5 shadow-lg backdrop-blur">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[11.5px] font-bold uppercase tracking-wider text-white">
            TrustDrive 3D Studio
          </span>
          <span className="text-[10px] text-[#7A8089] font-mono">
            | {viewMode.toUpperCase()}
          </span>
        </div>

        {/* Right: 4 Vehicle Mode Pills & Theater Mode Toggle */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#111315]/90 p-1 shadow-lg backdrop-blur">
            {(
              [
                { id: "normal", label: "Normal", icon: "Car" },
                { id: "exploded", label: "Exploded", icon: "Layers" },
                { id: "damage", label: "Damage", icon: "ShieldAlert" },
                { id: "xray", label: "X-Ray", icon: "Eye" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setViewMode(m.id);
                  if (m.id === "exploded") setExplodedProgress(1.0);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all",
                  viewMode === m.id
                    ? "bg-primary text-[var(--on-primary)] shadow-md"
                    : "text-[#BFC3C8] hover:text-white"
                )}
              >
                <Icon name={m.icon as any} size={13} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Theater View Button */}
          <button
            onClick={toggleTheaterMode}
            className={cn(
              "flex items-center gap-1.5 rounded-full border border-white/10 bg-[#111315]/90 px-3 py-1.5 text-[11px] font-semibold transition-all shadow-lg backdrop-blur",
              theaterMode
                ? "bg-primary text-[var(--on-primary)]"
                : "text-[#BFC3C8] hover:text-white hover:border-white/20"
            )}
            title={theaterMode ? "Exit Theater Mode (Esc)" : "Expand Theater Mode"}
          >
            <Icon name={theaterMode ? "Minimize2" : "Maximize2"} size={13} />
            <span className="hidden sm:inline">{theaterMode ? "Exit Theater" : "Theater View"}</span>
          </button>
        </div>
      </div>

      {/* QUICK DAMAGE SHORTCUT BAR: Always visible when defects exist */}
      {damagedHotspotsList.length > 0 && (
        <div className="pointer-events-none absolute left-3 right-3 top-14 z-20 flex justify-center">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-full border border-amber-900/40 bg-[#14120E]/90 px-3.5 py-1 shadow-lg backdrop-blur">
            <span className="text-[10px] font-mono uppercase text-amber-400 font-bold flex items-center gap-1">
              <Icon name="AlertCircle" size={12} />
              Recorded Defects ({damagedHotspotsList.length}):
            </span>
            {damagedHotspotsList.map((dh) => {
              const cId = mapZoneToComponentId(dh.componentId || dh.id);
              const isCur = selectedComponentId === cId;
              return (
                <button
                  key={dh.id}
                  onClick={() => {
                    setSelectedComponentId(cId);
                    setIsInspectorCollapsed(false);
                    focusCameraOnComponent(cId);
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition border",
                    isCur
                      ? "border-primary bg-primary text-[var(--on-primary)] shadow-sm"
                      : "border-amber-900/50 bg-amber-950/40 text-amber-200 hover:border-amber-600 hover:text-white"
                  )}
                >
                  <span>{dh.label}</span>
                  <span className="rounded bg-black/40 px-1 text-[9px] font-mono">
                    {dh.damage?.length ?? 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-CONTROLS BAR (Exploded slider or Severity filters) */}
      {viewMode === "exploded" && (
        <div className="pointer-events-none absolute left-3 right-3 top-24 z-20 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-[#111315]/90 px-4 py-1.5 shadow-lg backdrop-blur">
            <Icon name="SlidersHorizontal" size={13} className="text-primary" />
            <span className="text-[11px] font-mono text-[#9299A2]">Disassembly</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={explodedProgress}
              onChange={(e) => setExplodedProgress(parseFloat(e.target.value))}
              aria-label="Disassembly percentage"
              className="h-1.5 w-28 sm:w-36 cursor-pointer accent-primary"
            />
            <span className="w-9 text-right text-[11px] font-mono text-primary font-bold">
              {Math.round(explodedProgress * 100)}%
            </span>
            <button
              onClick={() => setExplodedProgress((p) => (p > 0.05 ? 0 : 1))}
              className="rounded-full bg-surface-tint px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-white transition"
            >
              {explodedProgress > 0.05 ? "Reassemble" : "Explode"}
            </button>
          </div>
        </div>
      )}

      {viewMode === "damage" && (
        <div className="pointer-events-none absolute left-3 right-3 top-24 z-20 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-[#111315]/90 px-3.5 py-1.5 shadow-lg backdrop-blur">
            <span className="text-[10px] font-mono uppercase text-[#7A8089] mr-1">Severity Filter:</span>
            {["ALL", "MINOR", "MODERATE", "MAJOR"].map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition-all",
                  severityFilter === s
                    ? "bg-[#F59E0B] text-black shadow-md font-bold"
                    : "text-[#9299A2] hover:text-white"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DOCKED RIGHT INSPECTOR PANEL (Sliding Drawer that never blocks the vehicle) */}
      {activeComponent && (
        <>
          {isInspectorCollapsed ? (
            /* Minimized Collapsed Pill in Corner */
            <div className="pointer-events-auto absolute right-3 top-16 z-30 flex items-center gap-2 rounded-full border border-white/20 bg-[#111315]/95 px-3 py-1.5 shadow-2xl backdrop-blur-md">
              <span className="text-[11px] font-bold text-white">
                {activeComponent.label}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.2 text-[9.5px] font-bold uppercase",
                  (activeHotspot?.damage?.length ?? 0) > 0
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300"
                )}
              >
                {(activeHotspot?.damage?.length ?? 0) > 0 ? "Damaged" : "Clear"}
              </span>
              <button
                onClick={() => setIsInspectorCollapsed(false)}
                className="rounded-full bg-white/10 p-1 text-white hover:bg-white/20"
                title="Expand panel"
              >
                <Icon name="ChevronLeft" size={13} />
              </button>
              <button
                onClick={() => setSelectedComponentId(null)}
                className="text-[#7A8089] hover:text-white"
                title="Close"
              >
                <Icon name="X" size={13} />
              </button>
            </div>
          ) : (
            /* Expanded Slide-out Inspector Drawer */
            <div className="pointer-events-auto absolute bottom-16 right-3 top-16 z-30 w-[360px] sm:w-[390px] max-w-[calc(100%-1.5rem)] flex flex-col rounded-2xl border border-white/15 bg-[#111315]/95 p-4 shadow-2xl backdrop-blur-md animate-fade-left overflow-hidden">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 border-b border-[#23262A] pb-3">
                <div>
                  <span className="text-[9.5px] font-mono uppercase tracking-widest text-primary font-bold">
                    {activeComponent.category.replace(/_/g, " ")}
                  </span>
                  <h4 className="text-[16px] font-bold text-white leading-tight mt-0.5">
                    {activeComponent.label}
                  </h4>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => focusCameraOnComponent(activeComponent.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[#7A8089] hover:bg-[#1E2226] hover:text-primary transition"
                    title="Focus Camera on this Panel"
                  >
                    <Icon name="Crosshair" size={14} />
                  </button>
                  <button
                    onClick={() => setIsInspectorCollapsed(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[#7A8089] hover:bg-[#1E2226] hover:text-white transition"
                    title="Minimize Inspector"
                  >
                    <Icon name="ChevronRight" size={15} />
                  </button>
                  <button
                    onClick={() => setSelectedComponentId(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[#7A8089] hover:bg-[#1E2226] hover:text-white transition"
                    title="Close Panel"
                  >
                    <Icon name="X" size={15} />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 text-[12px]">
                {/* Component Condition Badge */}
                {activeComponent.available ? (
                  <div className="flex items-center justify-between rounded-lg bg-[#181B1F] p-2.5 border border-[#23262A]">
                    <span className="text-muted text-[11px]">Assessment:</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider",
                        (activeHotspot?.damage?.length ?? 0) > 0
                          ? "bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40"
                          : "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40"
                      )}
                    >
                      {(activeHotspot?.damage?.length ?? 0) > 0
                        ? `${activeHotspot!.damage!.length} Damage Item(s)`
                        : "OEM Factory Verified Clear"}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-lg bg-amber-950/30 p-2.5 text-[11px] text-amber-200 border border-amber-900/40">
                    <span className="font-bold">Unavailable on this body style:</span> {activeComponent.unavailableReason}
                  </div>
                )}

                {/* Component Description */}
                <p className="text-[11.5px] leading-relaxed text-[#9299A2]">
                  {activeComponent.description}
                </p>

                {/* Damage Records Section */}
                {activeHotspot?.damage && activeHotspot.damage.length > 0 ? (
                  <div className="space-y-2 pt-1 border-t border-[#23262A]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#F59E0B] font-bold">
                        Database Damage Records ({activeHotspot.damage.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {activeHotspot.damage.map((d) => (
                        <div
                          key={d.id}
                          className="rounded-xl border border-white/10 bg-[#171A1E] p-3 text-[11.5px] space-y-2 shadow-md"
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                d.severity === "Major"
                                  ? "bg-red-950/60 text-red-400 border border-red-800/40"
                                  : d.severity === "Moderate"
                                  ? "bg-amber-950/60 text-amber-300 border border-amber-800/40"
                                  : "bg-blue-950/60 text-blue-300 border border-blue-800/40"
                              )}
                            >
                              {d.severity} Defect
                            </span>
                            <span className="text-[10px] font-mono uppercase text-muted">
                              {d.status}
                            </span>
                          </div>
                          <p className="text-white leading-snug font-medium pt-0.5">
                            {d.description}
                          </p>
                          <div className="flex flex-col gap-1 border-t border-[#23262A] pt-1.5 text-[10.5px] text-[#9299A2]">
                            <div className="flex items-center justify-between">
                              <span>Repair Status:</span>
                              <span className="font-semibold text-white">{d.repairStatus}</span>
                            </div>
                            {d.repairDetails && (
                              <div className="flex items-center justify-between">
                                <span>Details:</span>
                                <span className="text-muted">{d.repairDetails}</span>
                              </div>
                            )}
                            {d.inspectionDate && (
                              <div className="flex items-center justify-between">
                                <span>Inspection Date:</span>
                                <span className="font-mono text-muted">{d.inspectionDate}</span>
                              </div>
                            )}
                            {d.repairInvoiceDocId && (
                              <div className="flex items-center justify-between pt-1">
                                <span className="text-primary font-mono text-[10px]">Invoice Ref:</span>
                                <span className="font-mono text-white text-[10px] bg-black/40 px-1.5 py-0.5 rounded">
                                  {d.repairInvoiceDocId}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#23262A] bg-[#141619] p-3 text-[11px] text-muted space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[#10B981] font-semibold text-[11.5px]">
                      <Icon name="CheckCircle2" size={14} />
                      <span>OEM Specification Passed</span>
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-[#7A8089]">
                      Factory paint depth of 118 µm, zero panel alignment deviation, and intact clearcoat. No accident damage or repaints recorded.
                    </p>
                  </div>
                )}

                {/* Quick-Jump to Other Damaged Panels */}
                {damagedHotspotsList.length > 0 && (
                  <div className="pt-2 border-t border-[#23262A]">
                    <span className="text-[10px] font-mono uppercase text-[#7A8089] block mb-1.5 font-bold">
                      Jump to Other Damaged Panels:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {damagedHotspotsList.map((dh) => {
                        const cId = mapZoneToComponentId(dh.componentId || dh.id);
                        const isCur = selectedComponentId === cId;
                        return (
                          <button
                            key={dh.id}
                            onClick={() => {
                              setSelectedComponentId(cId);
                              focusCameraOnComponent(cId);
                            }}
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition border",
                              isCur
                                ? "border-primary bg-primary text-[var(--on-primary)]"
                                : "border-amber-900/40 bg-amber-950/30 text-amber-300 hover:border-amber-700"
                            )}
                          >
                            {dh.label} ({dh.damage?.length ?? 0})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer action */}
              <div className="border-t border-[#23262A] pt-2.5 flex items-center justify-between">
                <button
                  onClick={() => focusCameraOnComponent(activeComponent.id)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  <Icon name="Crosshair" size={12} />
                  <span>Center Camera</span>
                </button>
                <button
                  onClick={() => setSelectedComponentId(null)}
                  className="text-[11px] font-semibold text-muted hover:text-white"
                >
                  Dismiss Panel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* BOTTOM TOOLBAR: Camera Presets & Interactive View Controls */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex flex-col sm:flex-row items-center justify-between gap-2">
        {/* Left: Camera Angle Presets */}
        <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto max-w-full rounded-full border border-white/10 bg-[#111315]/90 p-1 shadow-lg backdrop-blur">
          {Object.entries(CAMERA_PRESETS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-all whitespace-nowrap",
                activePreset === key
                  ? "bg-primary text-[var(--on-primary)] shadow-sm"
                  : "text-[#9299A2] hover:text-white"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Right: Orbit Tools (Turntable Auto-Rotate, Reset, Theater View, Fullscreen) */}
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#111315]/90 p-1 shadow-lg backdrop-blur">
          <button
            onClick={() => setAutoRotate((v) => !v)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition",
              autoRotate ? "bg-primary/25 text-primary" : "text-[#9299A2] hover:bg-[#1E2226] hover:text-white"
            )}
            title={autoRotate ? "Pause Turntable" : "Start Turntable"}
            aria-label="Toggle turntable auto rotation"
          >
            <Icon name="RotateCw" size={13} className={autoRotate ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => {
              applyPreset("hero");
              setViewMode("normal");
              setSelectedComponentId(null);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#9299A2] hover:bg-[#1E2226] hover:text-white transition"
            title="Reset to Hero Angle"
            aria-label="Reset view"
          >
            <Icon name="RefreshCw" size={13} />
          </button>
          <button
            onClick={toggleTheaterMode}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full transition",
              theaterMode ? "bg-primary text-black" : "text-[#9299A2] hover:bg-[#1E2226] hover:text-white"
            )}
            title={theaterMode ? "Exit Theater Mode" : "Expand to Theater Mode"}
            aria-label="Toggle theater mode"
          >
            <Icon name={theaterMode ? "Minimize" : "Maximize"} size={13} />
          </button>
          <button
            onClick={toggleNativeFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#9299A2] hover:bg-[#1E2226] hover:text-white transition"
            title={fullscreen ? "Exit Fullscreen" : "Native Fullscreen"}
            aria-label="Toggle fullscreen"
          >
            <Icon name="Expand" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

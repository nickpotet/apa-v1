import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Language } from '../voice/providers/VoiceProvider';
import type { KioskState } from '../types';

// KioskState → animation clip name in GLB
const STATE_ANIM: Record<KioskState, string> = {
  idle:      'idle',
  preparing: 'thinking',
  listening: 'listening',
  thinking:  'thinking',
  speaking:  'speaking',
  excited:   'excited',
  sleeping:  'sleeping',
  error:     'idle',
  capped:    'sleeping',
  offline:   'idle',
};

// Glow ring per state (applied to wrapper div)
const RING: Record<KioskState, string> = {
  idle:      'shadow-[0_0_70px_rgba(125,211,252,0.14)]',
  preparing: 'shadow-[0_0_80px_rgba(56,189,248,0.20)]',
  listening: 'shadow-[0_0_90px_rgba(56,189,248,0.32)]',
  thinking:  'shadow-[0_0_90px_rgba(251,191,36,0.26)]',
  speaking:  'shadow-[0_0_90px_rgba(52,211,153,0.30)]',
  excited:   'shadow-[0_0_100px_rgba(250,204,21,0.36)]',
  sleeping:  'shadow-[0_0_50px_rgba(255,255,255,0.08)] opacity-70',
  error:     'shadow-[0_0_85px_rgba(239,68,68,0.28)]',
  capped:    'shadow-[0_0_50px_rgba(255,255,255,0.08)] opacity-75',
  offline:   'shadow-[0_0_70px_rgba(239,68,68,0.18)] opacity-75',
};

// Loops vs plays-once
const LOOP_ONCE = new Set(['excited']);
const MAX_RENDER_DPR = 1.35;
const ACTIVE_FRAME_MS = 1000 / 30;
const HIDDEN_FRAME_MS = 1000 / 2;

interface Props {
  kioskState: KioskState;
  lang: Language;
}

export function ApaDriver({ kioskState, lang: _lang }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const currentRef = useRef<THREE.AnimationAction | null>(null);
  const rafRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Play a named animation with crossfade
  const playAnim = useCallback((name: string) => {
    const map = actionsRef.current;
    const key = [...map.keys()].find(k => k.toLowerCase().includes(name.toLowerCase()));
    if (!key) return;
    const next = map.get(key)!;
    if (currentRef.current && currentRef.current !== next) {
      currentRef.current.fadeOut(0.3);
    }
    next.reset().fadeIn(0.3).play();
    next.setLoop(
      LOOP_ONCE.has(name) ? THREE.LoopOnce : THREE.LoopRepeat,
      Infinity,
    );
    next.clampWhenFinished = LOOP_ONCE.has(name);
    currentRef.current = next;
  }, []);

  // Boot Three.js scene once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let contextReloadTimer: number | undefined;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();

    // Lighting (matches preview_apa.html)
    scene.add(new THREE.AmbientLight(0xb0d8ff, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 3.5);
    key.position.set(2, 5, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6eaee8, 1.0);
    fill.position.set(-3, 2, -2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd580, 0.8);
    rim.position.set(0, 3, -4);
    scene.add(rim);

    // Camera
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    camera.position.set(0, 1.15, 3.0);
    camera.lookAt(0, 1.15, 0);

    // Resize
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Load GLB
    const loader = new GLTFLoader();
    loader.load('/Apa_kiosk_animated.glb', (gltf) => {
      if (disposed) return;
      const model = gltf.scene;

      // Auto-scale and floor at y=0
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 1.8 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

      scene.add(model);

      if (gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        for (const clip of gltf.animations) {
          actionsRef.current.set(clip.name, mixer.clipAction(clip));
        }
        playAnim(STATE_ANIM[kioskState] ?? 'idle');
      }
    });

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('[apa-driver] WebGL context lost; reloading kiosk view');
      contextReloadTimer = window.setTimeout(() => window.location.reload(), 1500);
    };
    const handleContextRestored = () => {
      console.warn('[apa-driver] WebGL context restored; reloading kiosk view');
      window.location.reload();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    // Render loop
    let lastFrameAt = 0;
    const animate = (now = 0) => {
      rafRef.current = requestAnimationFrame(animate);
      const targetFrameMs = document.visibilityState === 'hidden' ? HIDDEN_FRAME_MS : ACTIVE_FRAME_MS;
      if (now - lastFrameAt < targetFrameMs) return;
      lastFrameAt = now;
      mixerRef.current?.update(Math.min(clockRef.current.getDelta(), 1 / 24));
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(contextReloadTimer);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      ro.disconnect();
      actionsRef.current.clear();
      mixerRef.current = null;
      currentRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync animation to kioskState
  useEffect(() => {
    if (actionsRef.current.size === 0) return; // not loaded yet
    playAnim(STATE_ANIM[kioskState] ?? 'idle');
  }, [kioskState, playAnim]);

  return (
    <div className="relative h-full w-full">
      {/* Ground shadow */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[30%]"
        style={{
          width: '70%',
          height: '12%',
          background: 'radial-gradient(ellipse, rgba(0,20,60,0.38) 0%, transparent 70%)',
          filter: 'blur(4px)',
        }}
      />
      <div className={`relative w-full h-full rounded-full transition-shadow duration-700 ${RING[kioskState]}`}>
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    </div>
  );
}

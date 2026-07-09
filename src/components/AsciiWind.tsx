import { useEffect, useRef } from 'react';

const CHARS = '01|/\\.:*+';
const TARGET_FPS = 22;
const FRAME_MS = 1000 / TARGET_FPS;

interface Column {
  x: number;
  y: number;
  speed: number;
  length: number;
  chars: string[];
}

/**
 * Desktop-only decorative ASCII wind/strings for the idle home screen.
 * Pauses when the tab is hidden; unmount when scanning so it costs nothing mid-inference.
 */
export default function AsciiWind() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let columns: Column[] = [];
    let rafId = 0;
    let lastFrame = 0;
    let running = true;
    let charW = 10;
    let charH = 14;

    const rebuild = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      charW = Math.max(8, ctx.measureText('0').width + 2);
      charH = 14;

      const colCount = Math.max(8, Math.floor(w / (charW * 1.6)));
      columns = Array.from({ length: colCount }, (_, i) => {
        const length = 6 + Math.floor(Math.random() * 14);
        return {
          x: i * charW * 1.6 + (Math.random() * charW) / 2,
          y: Math.random() * h,
          speed: 18 + Math.random() * 42,
          length,
          chars: Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
        };
      });
    };

    const draw = (now: number) => {
      if (!running) return;
      rafId = requestAnimationFrame(draw);

      if (document.visibilityState === 'hidden') return;
      if (now - lastFrame < FRAME_MS) return;
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      for (const col of columns) {
        col.y += col.speed * dt;
        // Slight horizontal drift = wind
        col.x += Math.sin(now / 900 + col.y / 80) * 0.15;

        if (col.y - col.length * charH > h) {
          col.y = -Math.random() * h * 0.3;
          col.x = Math.random() * w;
          col.speed = 18 + Math.random() * 42;
          for (let i = 0; i < col.chars.length; i++) {
            if (Math.random() < 0.35) {
              col.chars[i] = CHARS[Math.floor(Math.random() * CHARS.length)];
            }
          }
        }

        for (let i = 0; i < col.chars.length; i++) {
          const cy = col.y - i * charH;
          if (cy < -charH || cy > h + charH) continue;
          const head = i === 0;
          const alpha = head ? 0.55 : Math.max(0.08, 0.35 - i * 0.025);
          ctx.fillStyle = head
            ? `rgba(255, 255, 255, ${alpha})`
            : `rgba(255, 255, 255, ${alpha * 0.75})`;
          ctx.fillText(col.chars[i], col.x, cy);
        }
      }
    };

    rebuild();
    lastFrame = performance.now();
    rafId = requestAnimationFrame(draw);

    const onResize = () => rebuild();
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none opacity-70"
    />
  );
}

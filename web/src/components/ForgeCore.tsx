// Animated 3D "forge core": a rotating particle sphere drawn on a 2D canvas
// (no 3D library, so the single-file app stays small). It heats up while the
// AI works and bursts outward when a recipe is ready.
import { useEffect, useRef } from 'react';

export interface ForgeCoreHandle { heat: (on: boolean) => void; burst: () => void }

export default function ForgeCore({ onReady, height = 220 }: { onReady?: (h: ForgeCoreHandle) => void; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().split(/\s+/).join(',') || '100,139,255';

    // Fibonacci sphere
    const N = innerWidth < 640 ? 700 : 1100;
    const pts: { x: number; y: number; z: number; r: number }[] = [];
    const g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), t = g * i;
      pts.push({ x: Math.cos(t) * rad, y, z: Math.sin(t) * rad, r: Math.random() });
    }
    // Inner crystal (icosahedron) edges
    const p = (1 + Math.sqrt(5)) / 2;
    const V = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]]
      .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
    const E: [number, number][] = [];
    for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) {
      const d = Math.hypot(V[a][0] - V[b][0], V[a][1] - V[b][1], V[a][2] - V[b][2]);
      if (d < 1.1) E.push([a, b]);
    }

    let w = 0, h = 0, dpr = 1;
    const fit = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit(); const ro = new ResizeObserver(fit); ro.observe(canvas);

    let energy = 0, target = 0, burst = 0, rotY = 0, rotX = 0.35, crystal = 0, time = 0, raf = 0, last = performance.now();
    let mx = 0, my = 0;
    const onMove = (e: PointerEvent) => { const b = canvas.getBoundingClientRect(); mx = ((e.clientX - b.left) / b.width - .5) * 2; my = ((e.clientY - b.top) / b.height - .5) * 2; };
    canvas.addEventListener('pointermove', onMove);
    onReady?.({ heat: (on) => { target = on ? 1 : 0; }, burst: () => { burst = 1; } });

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, .05); last = now;
      const speed = reduced ? .15 : 1;
      time += dt * speed; energy += (target - energy) * Math.min(1, dt * 3); burst *= Math.pow(.05, dt);
      rotY += dt * (.25 + energy * 1.6) * speed; crystal += dt * (.5 + energy * 3) * speed;
      const tiltX = rotX + my * .3, tiltZ = -mx * .15;
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(tiltX), sx = Math.sin(tiltX), cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
      const R = Math.min(w, h) * .36, ox = w / 2, oy = h / 2;
      const A = css('--primary'), B = css('--violet');

      ctx.clearRect(0, 0, w, h);
      // soft glow
      const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, R * 1.5);
      glow.addColorStop(0, `rgba(${B},${.16 + energy * .2 + burst * .2})`); glow.addColorStop(1, `rgba(${B},0)`);
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

      // particles
      for (const q of pts) {
        const wave = Math.sin(q.y * 4 + time * 1.4 + q.r * 6.28) * .05 + Math.sin(q.x * 3 - time * .9) * .03;
        const s = 1 + wave * (1 + energy * 3) + energy * .22 * q.r + burst * .8 * q.r;
        let x = q.x * s, y = q.y * s, z = q.z * s;
        [x, z] = [x * cy - z * sy, x * sy + z * cy];
        [y, z] = [y * cx - z * sx, y * sx + z * cx];
        [x, y] = [x * cz - y * sz, x * sz + y * cz];
        const persp = 3 / (3 + z);
        const px = ox + x * R * persp, py = oy + y * R * persp;
        const depth = (1 - z) / 2;
        const a = (.15 + q.r * .5) * (.35 + depth * .65) * (1 - burst * .4);
        ctx.fillStyle = `rgba(${q.r < energy * .8 + burst ? A : B},${a})`;
        const size = (.6 + q.r * 1.4) * persp * (1 + energy * .5);
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }

      // crystal
      const cs = .42 * (1 + energy * .35 + burst * .5);
      const cc = Math.cos(crystal), sc = Math.sin(crystal), cc2 = Math.cos(crystal * .7), sc2 = Math.sin(crystal * .7);
      const proj = V.map(([x, y, z]) => {
        [x, z] = [x * cc - z * sc, x * sc + z * cc];
        [y, z] = [y * cc2 - z * sc2, y * sc2 + z * cc2];
        const persp = 3 / (3 + z * cs);
        return [ox + x * R * cs * persp, oy + y * R * cs * persp];
      });
      ctx.strokeStyle = `rgba(${A},${.55 + energy * .4})`; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [a, b] of E) { ctx.moveTo(proj[a][0], proj[a][1]); ctx.lineTo(proj[b][0], proj[b][1]); }
      ctx.stroke();

      // orbit ring
      ctx.strokeStyle = `rgba(${B},.25)`; ctx.beginPath();
      ctx.ellipse(ox, oy, R * 1.25, R * .32, -mx * .1, 0, Math.PI * 2); ctx.stroke();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} aria-hidden className="w-full block" style={{ height }} />;
}

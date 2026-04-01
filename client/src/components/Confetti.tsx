import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const COLORS = ['#9945FF', '#14F195', '#00C2FF', '#FFD700', '#FF4ECD', '#FF6B35', '#ffffff'];

type Shape = 'ribbon' | 'circle' | 'square';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  size: number;
  color: string;
  shape: Shape;
  wobbleOffset: number;
  opacity: number;
}

export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const shapes: Shape[] = ['ribbon', 'circle', 'square'];
    const particles: Particle[] = Array.from({ length: 200 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 14;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
        size: 5 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: shapes[Math.floor(Math.random() * 3)],
        wobbleOffset: Math.random() * Math.PI * 2,
        opacity: 1,
      };
    });

    let frame = 0;
    let rafId: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      let alive = 0;

      for (const p of particles) {
        if (p.opacity <= 0) continue;
        alive++;

        // Physics
        p.vy += 0.28;
        p.vx *= 0.99;
        p.x += p.vx + Math.sin(p.wobbleOffset + frame * 0.05) * 0.8;
        p.y += p.vy;
        p.angle += p.spin;

        // Fade after frame 120
        if (frame > 120) {
          p.opacity = Math.max(0, p.opacity - 0.018);
        }

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'ribbon') {
          ctx.fillRect(-p.size, -p.size / 4, p.size * 2, p.size / 2);
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        }

        ctx.restore();
      }

      if (alive > 0 && frame < 400) {
        rafId = requestAnimationFrame(draw);
      }
    };

    rafId = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(rafId);
  }, []);

  return createPortal(
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />,
    document.body
  );
}

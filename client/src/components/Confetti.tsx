import { useEffect, useRef, useState } from 'react';

const COLORS = [
  '#9945FF', '#14F195', '#00C2FF', '#FFD700',
  '#FF4ECD', '#FF6B35', '#ffffff', '#43E97B',
  '#FF3CAC', '#784BA0', '#2B86C5',
];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  w: number;
  h: number;
  color: string;
  alpha: number;
  wobble: number;
  wobbleSpeed: number;
}

interface ConfettiProps {
  onDone?: () => void;
}

export function Confetti({ onDone }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const pieces: Piece[] = [];
    const TOTAL = 180;
    const DURATION = 4000;
    const start = Date.now();

    // Spawn all pieces spread across the top
    for (let i = 0; i < TOTAL; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 3,
        vy: 3 + Math.random() * 5,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.15,
        w: 8 + Math.random() * 10,
        h: 4 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 1,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.05 + Math.random() * 0.07,
      });
    }

    let rafId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const elapsed = Date.now() - start;
      const fadeStart = DURATION * 0.65;

      let alive = 0;

      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        if (p.alpha <= 0) continue;
        alive++;

        // Fade out in the last portion
        if (elapsed > fadeStart) {
          p.alpha = Math.max(0, 1 - (elapsed - fadeStart) / (DURATION - fadeStart));
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        // Draw a flat rectangle (classic confetti strip)
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();

        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 1.2;
        p.y += p.vy;
        p.vy += 0.12; // gravity
        p.vx *= 0.995;
        p.rotation += p.rotationSpeed;
      }

      if (elapsed < DURATION || alive > 0) {
        rafId = requestAnimationFrame(animate);
      } else {
        setVisible(false);
        onDone?.();
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[80]"
    />
  );
}

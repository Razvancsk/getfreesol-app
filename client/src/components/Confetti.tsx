import { useEffect, useRef, useState } from 'react';

const COLORS = [
  '#9945FF', '#14F195', '#00C2FF', '#FFD700',
  '#FF4ECD', '#FF6B35', '#ffffff', '#43E97B',
];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
  color: string;
  alpha: number;
  shape: 'rect' | 'circle' | 'strip';
}

function burst(canvas: HTMLCanvasElement, ox: number, oy: number, pieces: Piece[], count = 80) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 14;
    const shape = (['rect', 'circle', 'strip'] as const)[Math.floor(Math.random() * 3)];
    pieces.push({
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      width: 6 + Math.random() * 8,
      height: 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
      shape,
    });
  }
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
    const duration = 3500;
    const start = Date.now();

    // Initial big bursts from multiple screen positions
    burst(canvas, canvas.width * 0.2, canvas.height * 0.35, pieces, 90);
    burst(canvas, canvas.width * 0.5, canvas.height * 0.3, pieces, 110);
    burst(canvas, canvas.width * 0.8, canvas.height * 0.35, pieces, 90);
    burst(canvas, canvas.width * 0.35, canvas.height * 0.55, pieces, 60);
    burst(canvas, canvas.width * 0.65, canvas.height * 0.55, pieces, 60);

    // Extra staggered bursts
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => burst(canvas, canvas.width * 0.1,  canvas.height * 0.5, pieces, 70), 250));
    timers.push(setTimeout(() => burst(canvas, canvas.width * 0.9,  canvas.height * 0.5, pieces, 70), 350));
    timers.push(setTimeout(() => burst(canvas, canvas.width * 0.5,  canvas.height * 0.6, pieces, 80), 500));
    timers.push(setTimeout(() => burst(canvas, canvas.width * 0.25, canvas.height * 0.2, pieces, 60), 700));
    timers.push(setTimeout(() => burst(canvas, canvas.width * 0.75, canvas.height * 0.2, pieces, 60), 800));

    let rafId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const elapsed = Date.now() - start;

      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'strip') {
          ctx.fillRect(-p.width, -p.height / 4, p.width * 2, p.height / 2);
        } else {
          ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        }

        ctx.restore();

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35;
        p.vx *= 0.98;
        p.rotation += p.rotationSpeed;

        if (elapsed > duration * 0.5) {
          p.alpha -= 0.012;
        }
        if (p.alpha <= 0 || p.y > canvas.height + 40) {
          pieces.splice(i, 1);
        }
      }

      if (elapsed < duration || pieces.length > 0) {
        rafId = requestAnimationFrame(animate);
      } else {
        setVisible(false);
        onDone?.();
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      timers.forEach(clearTimeout);
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

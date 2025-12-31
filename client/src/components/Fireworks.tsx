import { useEffect, useState, useRef } from 'react';

const COLORS = [
  '#ff0040', '#ff4500', '#ffd700', '#00ff00', '#00bfff', 
  '#ff00ff', '#ff1493', '#7b68ee', '#00ffff', '#ffffff'
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
  trail: { x: number; y: number; alpha: number }[];
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  color: string;
  trail: { x: number; y: number; alpha: number }[];
}

export function Fireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();

    const particles: Particle[] = [];
    const rockets: Rocket[] = [];
    let animationId: number;
    let startTime = Date.now();
    const duration = 8000;

    const createRocket = () => {
      const x = Math.random() * canvas.width * 0.6 + canvas.width * 0.2;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      
      rockets.push({
        x,
        y: canvas.height,
        vy: -12 - Math.random() * 4,
        targetY: canvas.height * 0.15 + Math.random() * canvas.height * 0.35,
        color,
        trail: []
      });
    };

    const explode = (x: number, y: number, color: string) => {
      const particleCount = 60 + Math.floor(Math.random() * 40);
      
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.3;
        const speed = 2 + Math.random() * 6;
        const brightness = Math.random() > 0.3 ? color : '#ffffff';
        
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: brightness,
          size: 2 + Math.random() * 2,
          alpha: 1,
          decay: 0.008 + Math.random() * 0.008,
          trail: []
        });
      }
    };

    const launchInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed < duration - 1000) {
        createRocket();
        if (Math.random() > 0.5) createRocket();
        if (Math.random() > 0.7) createRocket();
      }
    }, 350);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = rockets.length - 1; i >= 0; i--) {
        const rocket = rockets[i];
        
        rocket.trail.push({ x: rocket.x, y: rocket.y, alpha: 0.8 });
        if (rocket.trail.length > 8) rocket.trail.shift();
        
        rocket.trail.forEach((point, idx) => {
          const trailAlpha = (idx / rocket.trail.length) * point.alpha * 0.5;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 200, 100, ${trailAlpha})`;
          ctx.fill();
        });

        ctx.beginPath();
        ctx.arc(rocket.x, rocket.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffcc00';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffcc00';
        ctx.fill();
        ctx.shadowBlur = 0;

        rocket.y += rocket.vy;
        rocket.vy += 0.08;

        if (rocket.y <= rocket.targetY || rocket.vy >= 0) {
          explode(rocket.x, rocket.y, rocket.color);
          rockets.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        p.trail.push({ x: p.x, y: p.y, alpha: p.alpha });
        if (p.trail.length > 5) p.trail.shift();
        
        p.trail.forEach((point, idx) => {
          const trailAlpha = (idx / p.trail.length) * point.alpha * 0.3;
          ctx.beginPath();
          ctx.arc(point.x, point.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = trailAlpha;
          ctx.fill();
        });

        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04;
        p.vx *= 0.99;
        p.alpha -= p.decay;
        p.size *= 0.995;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
        }
      }

      ctx.globalAlpha = 1;

      const elapsed = Date.now() - startTime;
      if (elapsed < duration || particles.length > 0 || rockets.length > 0) {
        animationId = requestAnimationFrame(animate);
      } else {
        setShow(false);
      }
    };

    createRocket();
    createRocket();
    animate();

    window.addEventListener('resize', resizeCanvas);

    return () => {
      clearInterval(launchInterval);
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  if (!show) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
    />
  );
}

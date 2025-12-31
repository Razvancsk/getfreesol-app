import { useEffect, useState, useRef } from 'react';

const COLORS = ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff69b4', '#ffd700', '#9333ea', '#ffffff'];

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  opacity: number;
}

export function Fireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const sparks: Spark[] = [];
    let animationId: number;
    let launchCount = 0;
    const maxLaunches = 10;

    const createExplosion = (x: number, y: number) => {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const sparkCount = 25 + Math.floor(Math.random() * 15);
      
      for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.3;
        const speed = 4 + Math.random() * 6;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          size: 3 + Math.random() * 4,
          opacity: 1
        });
      }
    };

    const launchFirework = () => {
      if (launchCount >= maxLaunches) return;
      
      const x = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
      const y = Math.random() * canvas.height * 0.5 + canvas.height * 0.1;
      
      createExplosion(x, y);
      launchCount++;
    };

    const launchInterval = setInterval(() => {
      launchFirework();
    }, 400);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i];
        
        spark.x += spark.vx;
        spark.y += spark.vy;
        spark.vy += 0.15;
        spark.opacity -= 0.02;
        spark.size *= 0.97;

        if (spark.opacity <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fillStyle = spark.color;
        ctx.globalAlpha = spark.opacity;
        ctx.shadowBlur = 15;
        ctx.shadowColor = spark.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = 1;
      animationId = requestAnimationFrame(animate);
    };

    launchFirework();
    launchFirework();
    animate();

    const hideTimer = setTimeout(() => {
      setShow(false);
    }, 5000);

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(launchInterval);
      cancelAnimationFrame(animationId);
      clearTimeout(hideTimer);
      window.removeEventListener('resize', handleResize);
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

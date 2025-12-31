import { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  speedX: number;
  speedY: number;
  life: number;
}

interface Firework {
  id: number;
  x: number;
  y: number;
  targetY: number;
  color: string;
  exploded: boolean;
  particles: Particle[];
}

const COLORS = ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff69b4', '#ffd700'];

export function Fireworks() {
  const [fireworks, setFireworks] = useState<Firework[]>([]);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const hasSeenFireworks = sessionStorage.getItem('seenFireworks');
    if (hasSeenFireworks) {
      setShow(false);
      return;
    }

    const createFirework = () => {
      const id = Date.now() + Math.random();
      const x = Math.random() * 100;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      
      return {
        id,
        x,
        y: 100,
        targetY: 20 + Math.random() * 30,
        color,
        exploded: false,
        particles: []
      };
    };

    const createParticles = (x: number, y: number, color: string): Particle[] => {
      const particles: Particle[] = [];
      const particleCount = 12 + Math.floor(Math.random() * 8);
      
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount;
        const speed = 2 + Math.random() * 3;
        particles.push({
          id: i,
          x,
          y,
          color,
          size: 3 + Math.random() * 3,
          speedX: Math.cos(angle) * speed,
          speedY: Math.sin(angle) * speed,
          life: 1
        });
      }
      return particles;
    };

    let animationId: number;
    let launchCount = 0;
    const maxLaunches = 8;

    const launchInterval = setInterval(() => {
      if (launchCount < maxLaunches) {
        setFireworks(prev => [...prev, createFirework()]);
        launchCount++;
      }
    }, 400);

    const animate = () => {
      setFireworks(prev => {
        return prev
          .map(fw => {
            if (!fw.exploded) {
              const newY = fw.y - 2;
              if (newY <= fw.targetY) {
                return {
                  ...fw,
                  y: newY,
                  exploded: true,
                  particles: createParticles(fw.x, newY, fw.color)
                };
              }
              return { ...fw, y: newY };
            } else {
              const updatedParticles = fw.particles
                .map(p => ({
                  ...p,
                  x: p.x + p.speedX * 0.3,
                  y: p.y + p.speedY * 0.3 + 0.1,
                  speedY: p.speedY + 0.05,
                  life: p.life - 0.02
                }))
                .filter(p => p.life > 0);
              
              return { ...fw, particles: updatedParticles };
            }
          })
          .filter(fw => !fw.exploded || fw.particles.length > 0);
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    const hideTimer = setTimeout(() => {
      setShow(false);
      sessionStorage.setItem('seenFireworks', 'true');
    }, 5000);

    return () => {
      clearInterval(launchInterval);
      cancelAnimationFrame(animationId);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {fireworks.map(fw => (
        <div key={fw.id}>
          {!fw.exploded && (
            <div
              className="absolute w-2 h-2 rounded-full animate-pulse"
              style={{
                left: `${fw.x}%`,
                top: `${fw.y}%`,
                backgroundColor: fw.color,
                boxShadow: `0 0 10px ${fw.color}, 0 0 20px ${fw.color}`
              }}
            />
          )}
          {fw.particles.map(p => (
            <div
              key={`${fw.id}-${p.id}`}
              className="absolute rounded-full"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                opacity: p.life,
                boxShadow: `0 0 ${p.size * 2}px ${p.color}`
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

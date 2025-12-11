import { useEffect, useState } from 'react';

interface Snowflake {
  id: number;
  left: number;
  animationDuration: number;
  animationDelay: number;
  size: number;
  opacity: number;
}

export function Snowfall() {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

  useEffect(() => {
    const flakes: Snowflake[] = [];
    const numFlakes = 60;

    for (let i = 0; i < numFlakes; i++) {
      flakes.push({
        id: i,
        left: Math.random() * 100,
        animationDuration: 8 + Math.random() * 12,
        animationDelay: Math.random() * 8,
        size: 2 + Math.random() * 5,
        opacity: 0.5 + Math.random() * 0.5,
      });
    }

    setSnowflakes(flakes);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes snowfall {
          0% {
            transform: translateY(-10vh) translateX(0);
          }
          50% {
            transform: translateY(50vh) translateX(10px);
          }
          100% {
            transform: translateY(110vh) translateX(-10px);
          }
        }
      `}</style>
      {snowflakes.map((flake) => (
        <div
          key={flake.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${flake.left}%`,
            top: '-10px',
            width: `${flake.size}px`,
            height: `${flake.size}px`,
            opacity: flake.opacity,
            animation: `snowfall ${flake.animationDuration}s linear ${flake.animationDelay}s infinite`,
            boxShadow: '0 0 2px rgba(255, 255, 255, 0.6)',
          }}
        />
      ))}
    </div>
  );
}

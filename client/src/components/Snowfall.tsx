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
    const numFlakes = 50;

    for (let i = 0; i < numFlakes; i++) {
      flakes.push({
        id: i,
        left: Math.random() * 100,
        animationDuration: 8 + Math.random() * 12,
        animationDelay: Math.random() * 8,
        size: 10 + Math.random() * 15,
        opacity: 0.6 + Math.random() * 0.4,
      });
    }

    setSnowflakes(flakes);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes snowfall {
          0% {
            transform: translateY(-10vh) translateX(0) rotate(0deg);
          }
          50% {
            transform: translateY(50vh) translateX(15px) rotate(180deg);
          }
          100% {
            transform: translateY(110vh) translateX(-15px) rotate(360deg);
          }
        }
      `}</style>
      {snowflakes.map((flake) => (
        <div
          key={flake.id}
          className="absolute"
          style={{
            left: `${flake.left}%`,
            top: '-20px',
            fontSize: `${flake.size}px`,
            opacity: flake.opacity,
            animation: `snowfall ${flake.animationDuration}s linear ${flake.animationDelay}s infinite`,
          }}
        >
          ❄️
        </div>
      ))}
    </div>
  );
}

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
        animationDuration: 5 + Math.random() * 10,
        animationDelay: Math.random() * 5,
        size: 3 + Math.random() * 8,
        opacity: 0.4 + Math.random() * 0.6,
      });
    }

    setSnowflakes(flakes);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes snowfall {
          0% {
            transform: translateY(-10vh) rotate(0deg);
          }
          100% {
            transform: translateY(110vh) rotate(360deg);
          }
        }
        @keyframes sway {
          0%, 100% {
            transform: translateX(0px);
          }
          50% {
            transform: translateX(20px);
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
            color: '#ffffff',
            textShadow: '0 0 3px rgba(255, 255, 255, 0.8)',
            filter: 'brightness(0) invert(1)',
          }}
        >
          ❄
        </div>
      ))}
    </div>
  );
}

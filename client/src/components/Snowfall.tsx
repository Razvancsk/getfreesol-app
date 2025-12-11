import { useEffect, useState } from 'react';

interface Snowflake {
  id: number;
  left: number;
  animationDuration: number;
  animationDelay: number;
  size: number;
  opacity: number;
  isEmoji: boolean;
}

export function Snowfall() {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

  useEffect(() => {
    const flakes: Snowflake[] = [];
    const numFlakes = 60;

    for (let i = 0; i < numFlakes; i++) {
      const isEmoji = Math.random() > 0.7;
      flakes.push({
        id: i,
        left: Math.random() * 100,
        animationDuration: 8 + Math.random() * 12,
        animationDelay: Math.random() * 8,
        size: isEmoji ? 12 + Math.random() * 14 : 2 + Math.random() * 5,
        opacity: 0.6 + Math.random() * 0.4,
        isEmoji,
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
        @keyframes snowfallDot {
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
        flake.isEmoji ? (
          <div
            key={flake.id}
            className="absolute"
            style={{
              left: `${flake.left}%`,
              top: '-20px',
              fontSize: `${flake.size}px`,
              opacity: flake.opacity,
              animation: `snowfall ${flake.animationDuration}s linear ${flake.animationDelay}s infinite`,
              filter: 'brightness(1.3) saturate(0.3)',
            }}
          >
            ❄️
          </div>
        ) : (
          <div
            key={flake.id}
            className="absolute rounded-full bg-white"
            style={{
              left: `${flake.left}%`,
              top: '-10px',
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              opacity: flake.opacity,
              animation: `snowfallDot ${flake.animationDuration}s linear ${flake.animationDelay}s infinite`,
              boxShadow: '0 0 2px rgba(255, 255, 255, 0.6)',
            }}
          />
        )
      ))}
    </div>
  );
}

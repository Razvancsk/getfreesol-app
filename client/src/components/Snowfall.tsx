import { useEffect, useState, useMemo } from 'react';

interface Snowflake {
  id: number;
  left: number;
  animationDuration: number;
  animationDelay: number;
  size: number;
  opacity: number;
  isEmoji: boolean;
  endX: number;
}

export function Snowfall() {
  const snowflakes = useMemo(() => {
    const flakes: Snowflake[] = [];
    const numFlakes = 60;

    for (let i = 0; i < numFlakes; i++) {
      const isEmoji = Math.random() > 0.7;
      flakes.push({
        id: i,
        left: Math.random() * 100,
        animationDuration: 12 + Math.random() * 18,
        animationDelay: Math.random() * 15,
        size: isEmoji ? 12 + Math.random() * 14 : 2 + Math.random() * 5,
        opacity: 0.6 + Math.random() * 0.4,
        isEmoji,
        endX: -50 + Math.random() * 100,
      });
    }

    return flakes;
  }, []);

  const keyframes = useMemo(() => {
    return snowflakes.map((flake) => `
      @keyframes fall${flake.id} {
        0% {
          transform: translateY(-5vh) translateX(0px)${flake.isEmoji ? ' rotate(0deg)' : ''};
        }
        100% {
          transform: translateY(105vh) translateX(${flake.endX}px)${flake.isEmoji ? ' rotate(360deg)' : ''};
        }
      }
    `).join('\n');
  }, [snowflakes]);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{keyframes}</style>
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
              animation: `fall${flake.id} ${flake.animationDuration}s linear ${flake.animationDelay}s infinite`,
              filter: 'brightness(2) saturate(0) contrast(1.5)',
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
              animation: `fall${flake.id} ${flake.animationDuration}s linear ${flake.animationDelay}s infinite`,
              boxShadow: '0 0 2px rgba(255, 255, 255, 0.6)',
            }}
          />
        )
      ))}
    </div>
  );
}

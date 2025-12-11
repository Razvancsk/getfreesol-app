import { useEffect, useState } from 'react';

interface Snowflake {
  id: number;
  left: number;
  animationDuration: number;
  animationDelay: number;
  size: number;
  opacity: number;
}

interface Decoration {
  id: number;
  left: number;
  top: number;
  emoji: string;
  size: number;
  animationDuration: number;
  animationDelay: number;
}

export function Snowfall() {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  const [decorations, setDecorations] = useState<Decoration[]>([]);

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

    const christmasEmojis = ['🎄', '🍪', '🎅', '🦌', '🎁', '🔔', '⭐', '🧑‍🎄'];
    const decos: Decoration[] = [];
    const numDecos = 12;

    for (let i = 0; i < numDecos; i++) {
      decos.push({
        id: i,
        left: Math.random() * 95,
        top: Math.random() * 90,
        emoji: christmasEmojis[Math.floor(Math.random() * christmasEmojis.length)],
        size: 20 + Math.random() * 20,
        animationDuration: 15 + Math.random() * 20,
        animationDelay: Math.random() * 5,
      });
    }

    setDecorations(decos);
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
        @keyframes floatAround {
          0% {
            transform: translate(0, 0) rotate(0deg);
          }
          25% {
            transform: translate(20px, 30px) rotate(10deg);
          }
          50% {
            transform: translate(-10px, 50px) rotate(-5deg);
          }
          75% {
            transform: translate(15px, 20px) rotate(5deg);
          }
          100% {
            transform: translate(0, 0) rotate(0deg);
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
      {decorations.map((deco) => (
        <div
          key={`deco-${deco.id}`}
          className="absolute"
          style={{
            left: `${deco.left}%`,
            top: `${deco.top}%`,
            fontSize: `${deco.size}px`,
            animation: `floatAround ${deco.animationDuration}s ease-in-out ${deco.animationDelay}s infinite`,
            opacity: 0.8,
          }}
        >
          {deco.emoji}
        </div>
      ))}
    </div>
  );
}

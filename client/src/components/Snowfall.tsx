import { useEffect, useState } from 'react';

interface Snowflake {
  id: number;
  left: number;
  animationDuration: number;
  animationDelay: number;
  size: number;
  opacity: number;
  isEmoji: boolean;
  swayAmount: number;
  swayDirection: number;
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
        animationDuration: 10 + Math.random() * 15,
        animationDelay: Math.random() * 10,
        size: isEmoji ? 12 + Math.random() * 14 : 2 + Math.random() * 5,
        opacity: 0.6 + Math.random() * 0.4,
        isEmoji,
        swayAmount: 20 + Math.random() * 60,
        swayDirection: Math.random() > 0.5 ? 1 : -1,
      });
    }

    setSnowflakes(flakes);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes snowfall0 {
          0% { transform: translateY(-5vh) translateX(0) rotate(0deg); }
          20% { transform: translateY(18vh) translateX(30px) rotate(72deg); }
          40% { transform: translateY(38vh) translateX(-20px) rotate(144deg); }
          60% { transform: translateY(58vh) translateX(40px) rotate(216deg); }
          80% { transform: translateY(78vh) translateX(-30px) rotate(288deg); }
          100% { transform: translateY(105vh) translateX(10px) rotate(360deg); }
        }
        @keyframes snowfall1 {
          0% { transform: translateY(-5vh) translateX(0) rotate(0deg); }
          25% { transform: translateY(23vh) translateX(-40px) rotate(90deg); }
          50% { transform: translateY(48vh) translateX(25px) rotate(180deg); }
          75% { transform: translateY(73vh) translateX(-35px) rotate(270deg); }
          100% { transform: translateY(105vh) translateX(15px) rotate(360deg); }
        }
        @keyframes snowfall2 {
          0% { transform: translateY(-5vh) translateX(0) rotate(0deg); }
          33% { transform: translateY(32vh) translateX(50px) rotate(120deg); }
          66% { transform: translateY(65vh) translateX(-45px) rotate(240deg); }
          100% { transform: translateY(105vh) translateX(20px) rotate(360deg); }
        }
        @keyframes snowfall3 {
          0% { transform: translateY(-5vh) translateX(0) rotate(0deg); }
          15% { transform: translateY(13vh) translateX(-25px) rotate(54deg); }
          35% { transform: translateY(33vh) translateX(35px) rotate(126deg); }
          55% { transform: translateY(53vh) translateX(-40px) rotate(198deg); }
          75% { transform: translateY(73vh) translateX(30px) rotate(270deg); }
          100% { transform: translateY(105vh) translateX(-15px) rotate(360deg); }
        }
        @keyframes snowfallDot0 {
          0% { transform: translateY(-5vh) translateX(0); }
          25% { transform: translateY(23vh) translateX(20px); }
          50% { transform: translateY(48vh) translateX(-15px); }
          75% { transform: translateY(73vh) translateX(25px); }
          100% { transform: translateY(105vh) translateX(-10px); }
        }
        @keyframes snowfallDot1 {
          0% { transform: translateY(-5vh) translateX(0); }
          20% { transform: translateY(18vh) translateX(-30px); }
          45% { transform: translateY(43vh) translateX(20px); }
          70% { transform: translateY(68vh) translateX(-25px); }
          100% { transform: translateY(105vh) translateX(15px); }
        }
        @keyframes snowfallDot2 {
          0% { transform: translateY(-5vh) translateX(0); }
          30% { transform: translateY(28vh) translateX(35px); }
          60% { transform: translateY(58vh) translateX(-30px); }
          100% { transform: translateY(105vh) translateX(5px); }
        }
        @keyframes snowfallDot3 {
          0% { transform: translateY(-5vh) translateX(0); }
          35% { transform: translateY(33vh) translateX(-20px); }
          65% { transform: translateY(63vh) translateX(30px); }
          100% { transform: translateY(105vh) translateX(-20px); }
        }
      `}</style>
      {snowflakes.map((flake) => {
        const animIndex = flake.id % 4;
        return flake.isEmoji ? (
          <div
            key={flake.id}
            className="absolute"
            style={{
              left: `${flake.left}%`,
              top: '-20px',
              fontSize: `${flake.size}px`,
              opacity: flake.opacity,
              animation: `snowfall${animIndex} ${flake.animationDuration}s ease-in-out ${flake.animationDelay}s infinite`,
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
              animation: `snowfallDot${animIndex} ${flake.animationDuration}s ease-in-out ${flake.animationDelay}s infinite`,
              boxShadow: '0 0 2px rgba(255, 255, 255, 0.6)',
            }}
          />
        );
      })}
    </div>
  );
}

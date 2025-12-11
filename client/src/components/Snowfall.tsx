import { useMemo } from 'react';

interface Snowflake {
  id: number;
  left: number;
  duration: number;
  delay: number;
  size: number;
  opacity: number;
  isEmoji: boolean;
  drift: number;
  layer: 'back' | 'mid' | 'front';
  blur: number;
  wobble: number;
}

export function Snowfall() {
  const snowflakes = useMemo(() => {
    const flakes: Snowflake[] = [];
    
    // Background layer - small, slow, blurry, faint
    for (let i = 0; i < 25; i++) {
      flakes.push({
        id: i,
        left: Math.random() * 100,
        duration: 20 + Math.random() * 15,
        delay: Math.random() * 20,
        size: 2 + Math.random() * 3,
        opacity: 0.2 + Math.random() * 0.2,
        isEmoji: false,
        drift: -20 + Math.random() * 40,
        layer: 'back',
        blur: 1 + Math.random() * 1.5,
        wobble: 5 + Math.random() * 10,
      });
    }
    
    // Middle layer - medium size, moderate speed
    for (let i = 25; i < 55; i++) {
      const isEmoji = Math.random() > 0.8;
      flakes.push({
        id: i,
        left: Math.random() * 100,
        duration: 14 + Math.random() * 10,
        delay: Math.random() * 15,
        size: isEmoji ? 14 + Math.random() * 8 : 3 + Math.random() * 4,
        opacity: 0.5 + Math.random() * 0.3,
        isEmoji,
        drift: -40 + Math.random() * 80,
        layer: 'mid',
        blur: 0.3 + Math.random() * 0.5,
        wobble: 8 + Math.random() * 15,
      });
    }
    
    // Foreground layer - larger, faster, sharp, bright
    for (let i = 55; i < 70; i++) {
      const isEmoji = Math.random() > 0.6;
      flakes.push({
        id: i,
        left: Math.random() * 100,
        duration: 8 + Math.random() * 6,
        delay: Math.random() * 10,
        size: isEmoji ? 20 + Math.random() * 12 : 4 + Math.random() * 5,
        opacity: 0.7 + Math.random() * 0.3,
        isEmoji,
        drift: -60 + Math.random() * 120,
        layer: 'front',
        blur: 0,
        wobble: 12 + Math.random() * 20,
      });
    }

    return flakes;
  }, []);

  const keyframes = useMemo(() => {
    return snowflakes.map((flake) => {
      const wobbleOffset1 = flake.wobble * (Math.random() > 0.5 ? 1 : -1) * 0.3;
      const wobbleOffset2 = flake.wobble * (Math.random() > 0.5 ? 1 : -1) * 0.5;
      const wobbleOffset3 = flake.wobble * (Math.random() > 0.5 ? 1 : -1) * 0.4;
      
      return `
        @keyframes fall${flake.id} {
          0% {
            transform: translateY(-5vh) translateX(0px)${flake.isEmoji ? ' rotate(0deg)' : ''};
            opacity: ${flake.opacity};
          }
          25% {
            transform: translateY(25vh) translateX(${flake.drift * 0.25 + wobbleOffset1}px)${flake.isEmoji ? ' rotate(90deg)' : ''};
            opacity: ${flake.opacity};
          }
          50% {
            transform: translateY(50vh) translateX(${flake.drift * 0.5 + wobbleOffset2}px)${flake.isEmoji ? ' rotate(180deg)' : ''};
            opacity: ${flake.opacity};
          }
          75% {
            transform: translateY(75vh) translateX(${flake.drift * 0.75 + wobbleOffset3}px)${flake.isEmoji ? ' rotate(270deg)' : ''};
            opacity: ${flake.opacity};
          }
          100% {
            transform: translateY(105vh) translateX(${flake.drift}px)${flake.isEmoji ? ' rotate(360deg)' : ''};
            opacity: ${flake.opacity};
          }
        }
      `;
    }).join('\n');
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
              top: '-30px',
              fontSize: `${flake.size}px`,
              animation: `fall${flake.id} ${flake.duration}s linear ${flake.delay}s infinite`,
              filter: `brightness(2) saturate(0) contrast(1.5) blur(${flake.blur}px)`,
              zIndex: flake.layer === 'front' ? 52 : flake.layer === 'mid' ? 51 : 50,
            }}
          >
            ❄️
          </div>
        ) : (
          <div
            key={flake.id}
            className="absolute rounded-full"
            style={{
              left: `${flake.left}%`,
              top: '-10px',
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              background: `radial-gradient(circle, rgba(255,255,255,${flake.opacity}) 0%, rgba(255,255,255,${flake.opacity * 0.6}) 50%, rgba(255,255,255,0) 100%)`,
              animation: `fall${flake.id} ${flake.duration}s linear ${flake.delay}s infinite`,
              filter: `blur(${flake.blur}px)`,
              boxShadow: flake.layer === 'front' ? '0 0 4px rgba(255, 255, 255, 0.8)' : 'none',
              zIndex: flake.layer === 'front' ? 52 : flake.layer === 'mid' ? 51 : 50,
            }}
          />
        )
      ))}
    </div>
  );
}

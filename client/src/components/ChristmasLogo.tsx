import logoImage from '@assets/image_1757882056840.png';

interface ChristmasLogoProps {
  size?: number;
  className?: string;
}

export function ChristmasLogo({ size = 100, className = '' }: ChristmasLogoProps) {
  const hatSize = size * 0.5;
  const hatTop = -size * 0.25;
  const hatLeft = size * 0.15;
  
  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <img 
        src={logoImage}
        alt="Get your SOL back!"
        className="w-full h-full"
      />
      <div 
        className="absolute"
        style={{
          top: hatTop,
          left: hatLeft,
          fontSize: hatSize,
          transform: 'rotate(-15deg)',
          zIndex: 10,
        }}
      >
        🎅
      </div>
      <div 
        className="absolute"
        style={{
          bottom: -size * 0.05,
          right: -size * 0.1,
          fontSize: size * 0.25,
        }}
      >
        🎄
      </div>
      <div 
        className="absolute"
        style={{
          bottom: size * 0.1,
          left: -size * 0.1,
          fontSize: size * 0.2,
        }}
      >
        ⭐
      </div>
    </div>
  );
}

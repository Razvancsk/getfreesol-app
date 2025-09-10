import React from 'react';
import axiomBannerImage from '@assets/image_1757461424106.png';

interface AxiomBannerProps {
  className?: string;
}

export default function AxiomBanner({ className = '' }: AxiomBannerProps) {
  const handleClick = () => {
    window.open('https://axiom.trade/@getfrees', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`w-full max-w-sm mx-auto ${className}`}>
      <button
        onClick={handleClick}
        className="w-full group cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none rounded-lg overflow-hidden"
        aria-label="Visit Axiom - Get your SOL back"
        data-testid="button-axiom-banner"
      >
        <img
          src={axiomBannerImage}
          alt="Axiom - Get your SOL back"
          className="w-full h-16 object-cover rounded-lg shadow-lg group-hover:shadow-xl transition-shadow duration-300"
        />
      </button>
      <p className="text-center text-sm text-purple-400 mt-0.5">Trade and get rewards</p>
    </div>
  );
}
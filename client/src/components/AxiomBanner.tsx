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
    <div className={`w-full ${className}`}>
      <button
        onClick={handleClick}
        className="w-full group cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-transparent rounded-lg overflow-hidden"
        aria-label="Visit Axiom - Get your SOL back"
        data-testid="button-axiom-banner"
      >
        <img
          src={axiomBannerImage}
          alt="Axiom - Get your SOL back"
          className="w-full h-auto object-cover rounded-lg shadow-lg group-hover:shadow-xl transition-shadow duration-300"
        />
      </button>
    </div>
  );
}
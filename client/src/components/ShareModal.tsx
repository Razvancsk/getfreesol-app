import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import logoImage from "@assets/image_1757882056840.png";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  solClaimed: number;
  referralCode: string | null;
  accountsClosed?: number;
  claimType?: 'accounts' | 'tokens' | 'nfts';
  walletAddress?: string;
}

export function ShareModal({ isOpen, onClose, solClaimed, referralCode, accountsClosed = 1, claimType = 'accounts' }: ShareModalProps) {
  const [tweetText, setTweetText] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  
  const getClaimText = () => {
    if (claimType === 'tokens') return `by burning ${accountsClosed} token${accountsClosed > 1 ? 's' : ''}!`;
    if (claimType === 'nfts') return `by burning ${accountsClosed} NFT${accountsClosed > 1 ? 's' : ''}!`;
    return `by closing ${accountsClosed} empty account${accountsClosed > 1 ? 's' : ''}!`;
  };

  useEffect(() => {
    if (isOpen) {
      const baseUrl = window.location.origin;
      const formattedSol = solClaimed.toFixed(4);
      const lamports = Math.floor(solClaimed * 1e9);
      
      // Share URL with params for OG image generation
      const url = referralCode 
        ? `${baseUrl}/share?ref=${referralCode}&sol=${lamports}&type=${claimType}&count=${accountsClosed}`
        : `${baseUrl}/share?sol=${lamports}&type=${claimType}&count=${accountsClosed}`;
      
      setShareUrl(url);
      setTweetText(`I just reclaimed ${formattedSol} $SOL using @getfreesol_xyz\n\nReclaim your locked SOL 👇`);
    }
  }, [isOpen, solClaimed, referralCode, accountsClosed, claimType]);
  
  const handleShareOnX = () => {
    // Open Twitter intent with text and URL
    const fullText = `${tweetText}\n${shareUrl}`;
    const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(fullText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-transparent border-0 p-0 [&>button]:hidden">
        <div className="space-y-4">
          <div 
            className="w-full aspect-[16/9] bg-gradient-to-r from-[#1a0a2e] via-[#2d1b4e] to-[#1a0a2e] rounded-xl shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden"
          >
            <div className="absolute top-4 left-4 flex items-center gap-3 z-10">
              <img src={logoImage} alt="GetFreeSol" className="w-12 h-12" />
              <span className="text-white font-bold text-xl">GET FREE SOL</span>
            </div>
            <p className="text-2xl md:text-3xl font-black text-green-400 tracking-wide z-10">
              CLAIMED
            </p>
            <p className="text-4xl md:text-5xl font-black text-white mt-2 z-10">
              + {solClaimed.toFixed(4)} SOL
            </p>
            <p className="text-green-400 text-base mt-3 z-10 font-mono">{getClaimText()}</p>
            
            <button 
              onClick={handleShareOnX}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-400 hover:bg-green-300 border-2 border-green-300 rounded-lg px-6 py-2 transition-colors z-10"
            >
              <span className="text-black font-mono font-bold text-base">Tweet It</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

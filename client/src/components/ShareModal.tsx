import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getRandomShareMessage } from "@shared/shareMessages";
import logoImage from "@assets/image_1757882056840.png";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  solClaimed: number;
  referralCode: string | null;
  accountsClosed?: number;
  claimType?: 'accounts' | 'tokens' | 'nfts';
}

export function ShareModal({ isOpen, onClose, solClaimed, referralCode, accountsClosed = 1, claimType = 'accounts' }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [tweetText, setTweetText] = useState("");
  const { toast } = useToast();
  
  const baseUrl = window.location.origin;
  const shareUrl = referralCode 
    ? `${baseUrl}?ref=${referralCode}&claimed=${Math.floor(solClaimed * 1e9)}`
    : `${baseUrl}?claimed=${Math.floor(solClaimed * 1e9)}`;
  
  const getClaimText = () => {
    if (claimType === 'tokens') return `by burning ${accountsClosed} tokens!`;
    if (claimType === 'nfts') return `by burning ${accountsClosed} NFTs!`;
    return `by closing ${accountsClosed} empty accounts!`;
  };
  
  // Pick a NEW random message every time the modal opens
  useEffect(() => {
    if (isOpen) {
      const lamports = Math.floor(solClaimed * 1e9);
      const message = getRandomShareMessage(lamports);
      const tweetText = `${message} ${shareUrl}`;
      setTweetText(tweetText);
    }
  }, [isOpen, solClaimed, shareUrl]);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Link copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };
  
  const handleShareOnX = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-transparent border-0 p-0 [&>button]:hidden">
        <div className="space-y-4">
          {/* Style 2 Card Banner */}
          <div className="w-full aspect-[16/9] bg-gradient-to-r from-[#1a0a2e] via-[#2d1b4e] to-[#1a0a2e] rounded-xl shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden">
            {/* Decorative diagonal */}
            <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-br from-purple-600/40 to-purple-800/60" style={{ clipPath: 'polygon(40% 0, 100% 0, 100% 100%, 0 100%)' }} />
            {/* Logo top left */}
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
            {/* Tweet It button */}
            <button 
              onClick={handleShareOnX}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-400 hover:bg-green-300 border-2 border-green-300 rounded-lg px-6 py-2 transition-colors z-10"
            >
              <span className="text-black font-mono font-bold text-base">Tweet It</span>
            </button>
          </div>
          
          {/* Shareable Link Section */}
          <div className="bg-purple-900/90 rounded-xl p-4 border border-purple-500/30">
            <p className="text-purple-200 text-sm mb-3 text-center">
              Share your referral link to earn 50% commission!
            </p>
            <div className="flex gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="bg-slate-800/50 border-purple-500/30 text-white text-sm flex-1 rounded-xl"
                data-testid="input-share-link"
              />
              <Button
                onClick={handleCopy}
                className="bg-green-600 hover:bg-green-700 text-white px-5 shrink-0 rounded-xl"
                data-testid="button-copy-link"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

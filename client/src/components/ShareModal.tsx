import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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

export function ShareModal({ isOpen, onClose, solClaimed, referralCode, accountsClosed = 1, claimType = 'accounts', walletAddress }: ShareModalProps) {
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [tweetUrl, setTweetUrl] = useState<string | null>(null);
  const { toast } = useToast();
  
  const getClaimText = () => {
    if (claimType === 'tokens') return `by burning ${accountsClosed} token${accountsClosed > 1 ? 's' : ''}!`;
    if (claimType === 'nfts') return `by burning ${accountsClosed} NFT${accountsClosed > 1 ? 's' : ''}!`;
    return `by closing ${accountsClosed} empty account${accountsClosed > 1 ? 's' : ''}!`;
  };

  useEffect(() => {
    if (isOpen) {
      setPosted(false);
      setTweetUrl(null);
    }
  }, [isOpen]);
  
  const handleShareOnX = async () => {
    setPosting(true);
    try {
      const response = await apiRequest('/api/share/tweet', {
        method: 'POST',
        body: JSON.stringify({
          solAmount: solClaimed,
          itemCount: accountsClosed,
          claimType,
          walletAddress,
          referralCode
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success && data.tweetUrl) {
        setPosted(true);
        setTweetUrl(data.tweetUrl);
        toast({
          title: "Posted to X!",
          description: "Your claim has been shared on @getfreesol_xyz",
        });
      } else {
        throw new Error(data.error || 'Failed to post');
      }
    } catch (error: any) {
      console.error('Error posting tweet:', error);
      toast({
        title: "Failed to post",
        description: error.message || "Could not post to X. Please try again.",
        variant: "destructive"
      });
    } finally {
      setPosting(false);
    }
  };

  const handleViewTweet = () => {
    if (tweetUrl) {
      window.open(tweetUrl, '_blank');
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-transparent border-0 p-0 [&>button]:hidden">
        <div className="space-y-4">
          <div 
            className="w-full aspect-[16/9] bg-gradient-to-r from-[#1a0a2e] via-[#2d1b4e] to-[#1a0a2e] rounded-xl shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden"
          >
            <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-br from-purple-600/40 to-purple-800/60" style={{ clipPath: 'polygon(40% 0, 100% 0, 100% 100%, 0 100%)' }} />
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
            
            {posted ? (
              <button 
                onClick={handleViewTweet}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-500 hover:bg-blue-400 border-2 border-blue-400 rounded-lg px-6 py-2 transition-colors z-10"
              >
                <span className="text-white font-mono font-bold text-base">View Tweet</span>
              </button>
            ) : (
              <button 
                onClick={handleShareOnX}
                disabled={posting}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-400 hover:bg-green-300 border-2 border-green-300 rounded-lg px-6 py-2 transition-colors z-10 disabled:opacity-50"
              >
                <span className="text-black font-mono font-bold text-base">
                  {posting ? "Posting..." : "Tweet It"}
                </span>
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

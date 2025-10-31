import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiX } from "react-icons/si";
import { Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getRandomShareMessage } from "@shared/shareMessages";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  solClaimed: number;
  referralCode: string | null;
}

export function ShareModal({ isOpen, onClose, solClaimed, referralCode }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [tweetText, setTweetText] = useState("");
  const { toast } = useToast();
  
  const baseUrl = window.location.origin;
  const shareUrl = referralCode 
    ? `${baseUrl}?ref=${referralCode}&claimed=${Math.floor(solClaimed * 1e9)}`
    : `${baseUrl}?claimed=${Math.floor(solClaimed * 1e9)}`;
  
  const commissionRate = "50%"; // 50% commission split
  
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
      <DialogContent className="sm:max-w-sm bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 border-purple-500/30 p-5 rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            Share
          </DialogTitle>
          <p className="text-sm text-purple-200 pt-1">
            Invite friends to earn more $SOL
          </p>
        </DialogHeader>
        
        <div className="space-y-3.5 pt-2">
          {/* Success Message */}
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-orange-400" style={{ fontFamily: 'Georgia, serif' }}>
              💀 The spirits rewarded your bravery… you've claimed your cursed SOL!
            </p>
            <p className="text-xl font-bold text-green-400">
              Your wallet has been haunted with {solClaimed.toFixed(6)} SOL
            </p>
          </div>
          
          {/* Social Share Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleShareOnX}
              className="rounded-full w-12 h-12 bg-black hover:bg-black/80 text-white p-0"
              data-testid="button-share-twitter"
            >
              <SiX className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Shareable Link */}
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
          
          {/* Commission Rate Display */}
          {referralCode && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-green-300">Your Commission Rate</p>
                <div className="bg-green-500/20 px-2.5 py-0.5 rounded-full">
                  <p className="text-xs text-green-300 font-semibold">
                    Highest in Market
                  </p>
                </div>
              </div>
              <p className="text-2xl font-bold text-green-400">{commissionRate}</p>
              <p className="text-xs text-green-200 mt-1.5">
                Earn {commissionRate} commission of every SOL your referrals claim!
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

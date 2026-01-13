import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  accountsClosed?: number;
}

export function ShareModal({ isOpen, onClose, solClaimed, referralCode, accountsClosed = 0 }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [tweetText, setTweetText] = useState("");
  const { toast } = useToast();
  
  const baseUrl = window.location.origin;
  const shareUrl = referralCode 
    ? `${baseUrl}?ref=${referralCode}&claimed=${Math.floor(solClaimed * 1e9)}`
    : `${baseUrl}?claimed=${Math.floor(solClaimed * 1e9)}`;
  
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
      <DialogContent className="sm:max-w-md bg-[#1a1a1a] border-none p-0 rounded-xl overflow-hidden">
        {/* Main content area */}
        <div className="flex items-center gap-4 p-5 bg-[#1a1a1a]">
          {/* Logo - GET FREE SOL branding */}
          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-2xl font-bold">GFS</span>
          </div>
          
          {/* Text content */}
          <div className="flex flex-col">
            <span className="text-gray-300 text-lg font-mono">I just reclaimed</span>
            <span className="text-green-400 text-3xl font-bold font-mono">{solClaimed.toFixed(6)} SOL</span>
            <span className="text-gray-300 text-lg font-mono">
              {accountsClosed > 0 ? `by closing ${accountsClosed} accounts!` : 'with GetFreeSOL!'}
            </span>
          </div>
        </div>
        
        {/* Domain footer with referral link */}
        <div className="bg-[#252525] border-t border-gray-700 px-5 py-3">
          <a 
            href={shareUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-green-400 text-xl font-mono hover:underline"
          >
            getfreesol.xyz
          </a>
        </div>
        
        {/* Referral commission info */}
        {referralCode && (
          <div className="bg-[#1a1a1a] px-5 py-2 text-center">
            <span className="text-green-400 text-sm">Earn 50% commission of every SOL your referrals claim!</span>
          </div>
        )}
        
        {/* Action buttons */}
        <div className="flex items-center justify-center gap-3 p-4 bg-[#1a1a1a]">
          <Button
            onClick={handleShareOnX}
            className="rounded-full px-6 py-2 bg-black hover:bg-black/80 text-white flex items-center gap-2"
            data-testid="button-share-twitter"
          >
            <SiX className="w-4 h-4" />
            Share on X
          </Button>
          <Button
            onClick={handleCopy}
            className="rounded-full px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
            data-testid="button-copy-link"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            Copy Link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
          {/* Logo */}
          <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg flex items-center justify-center shrink-0">
            <svg className="h-10 w-10" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3' }}>
              <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
              <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
              <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
            </svg>
          </div>
          
          {/* Text content */}
          <div className="flex flex-col">
            <span className="text-gray-300 text-lg font-mono">I just reclaimed</span>
            <span className="text-green-400 text-3xl font-bold font-mono">{solClaimed.toFixed(6)} SOL</span>
            <span className="text-gray-300 text-lg font-mono">
              {accountsClosed > 0 ? `by closing ${accountsClosed} accounts!` : 'with SolRefund!'}
            </span>
          </div>
        </div>
        
        {/* Domain footer */}
        <div className="bg-[#252525] border-t border-gray-700 px-5 py-3">
          <span className="text-gray-400 text-xl font-mono">solrefund.com</span>
        </div>
        
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

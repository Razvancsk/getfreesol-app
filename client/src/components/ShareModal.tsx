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
      <DialogContent className="sm:max-w-sm bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
            Share
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 pt-1">
            Invite friends to earn more $SOL
          </p>
        </DialogHeader>
        
        <div className="space-y-4 pt-2">
          {/* Social Share Buttons */}
          <div className="flex justify-start gap-3">
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
              className="bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white text-sm flex-1"
              data-testid="input-share-link"
            />
            <Button
              onClick={handleCopy}
              className="bg-green-600 hover:bg-green-700 text-white px-6 shrink-0"
              data-testid="button-copy-link"
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          
          {/* Commission Rate Display */}
          {referralCode && (
            <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-gray-700 dark:text-gray-300">Your Commission Rate</p>
                <div className="bg-green-100 dark:bg-green-900/50 px-2.5 py-0.5 rounded-full">
                  <p className="text-xs text-green-700 dark:text-green-300 font-semibold">
                    Highest in Market
                  </p>
                </div>
              </div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">{commissionRate}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

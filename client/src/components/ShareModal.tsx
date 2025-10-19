import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiX } from "react-icons/si";
import { Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  solClaimed: number;
  referralCode: string | null;
}

// Array of random tweet templates (outside component so it doesn't recreate)
const tweetTemplates = [
  `Found a sneaky {amount} $SOL chilling in my wallet 👀\nSnagged it instantly with Get Free Sol 💜 {link}`,
  `Didn't expect to see {amount} $SOL appear out of nowhere 👀\nClaimed it right away with Get Free Sol 💜 {link}`,
  `Tiny surprise in my wallet today — {amount} $SOL 💜\nQuick claim through Get Free Sol {link}`,
  `Found some free $SOL I didn't even know I had 😎\nGet Free Sol made the claim instant 💜 {link}`,
  `🎯 Just spotted {amount} $SOL waiting for me — claimed it instantly with Get Free Sol 💜\nTry your luck ⚡ {link}`,
  `Found {amount} $SOL sitting unclaimed — grabbed it in seconds with Get Free Sol ⚡\nYou might have some too 💜 {link}`,
  `Surprised to see {amount} $SOL ready to claim — used Get Free Sol and it was instant ⚡ {link}`,
  `🎯 Just claimed {amount} $SOL through Get Free Sol 💜\nQuick, clean, and smooth ⚡ {link}`,
  `🚀 Surprised to see {amount} $SOL waiting — claimed it easily with Get Free Sol {link}`,
  `🔥 Just noticed {amount} $SOL hiding — claimed it with Get Free Sol. Worth a look 💜 {link}`,
  `Found {amount} $SOL unclaimed — used Get Free Sol to collect it. See what you've got! {link}`,
  `🎯 {amount} $SOL popped up — claimed it through Get Free Sol. Try your chance! {link}`
];

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
      const randomTemplate = tweetTemplates[Math.floor(Math.random() * tweetTemplates.length)];
      const filledText = randomTemplate
        .replace('{amount}', solClaimed.toFixed(6))
        .replace('{link}', shareUrl);
      setTweetText(filledText);
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
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 border-purple-500/30">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white text-center">
            Share
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Success Message */}
          <div className="text-center">
            <p className="text-purple-200 mb-2">
              Invite friends to earn more $SOL
            </p>
            <p className="text-3xl font-bold text-green-400">
              {solClaimed.toFixed(6)} SOL Claimed! 🎉
            </p>
          </div>
          
          {/* Social Share Buttons */}
          <div className="flex justify-center gap-4">
            <Button
              onClick={handleShareOnX}
              className="rounded-full w-14 h-14 bg-black hover:bg-black/80 text-white"
              data-testid="button-share-twitter"
            >
              <SiX className="w-6 h-6" />
            </Button>
          </div>
          
          {/* Shareable Link */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="bg-slate-800/50 border-purple-500/30 text-white text-sm"
                data-testid="input-share-link"
              />
              <Button
                onClick={handleCopy}
                className="bg-green-600 hover:bg-green-700 text-white px-6"
                data-testid="button-copy-link"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          
          {/* Commission Rate Display */}
          {referralCode && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-300 mb-1">Your Commission Rate</p>
                  <p className="text-2xl font-bold text-green-400">{commissionRate}</p>
                </div>
                <div className="bg-green-500/20 px-3 py-1 rounded-full">
                  <p className="text-xs text-green-300 font-semibold">
                    Highest in Market
                  </p>
                </div>
              </div>
              <p className="text-xs text-green-200 mt-2">
                Earn {commissionRate} commission of every SOL your referrals claim!
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

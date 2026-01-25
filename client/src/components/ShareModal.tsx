import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
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
  const [tweetText, setTweetText] = useState("");
  const [copying, setCopying] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const baseUrl = window.location.origin;
  const lamports = Math.floor(solClaimed * 1e9);
  const shareUrl = referralCode 
    ? `${baseUrl}?ref=${referralCode}&claimed=${lamports}&type=${claimType}&count=${accountsClosed}`
    : `${baseUrl}?claimed=${lamports}&type=${claimType}&count=${accountsClosed}`;
  
  const getClaimText = () => {
    if (claimType === 'tokens') return `by burning ${accountsClosed} token${accountsClosed > 1 ? 's' : ''}!`;
    if (claimType === 'nfts') return `by burning ${accountsClosed} NFT${accountsClosed > 1 ? 's' : ''}!`;
    return `by closing ${accountsClosed} empty account${accountsClosed > 1 ? 's' : ''}!`;
  };
  
  useEffect(() => {
    if (isOpen) {
      const formattedSol = solClaimed.toFixed(4);
      const message = `I just reclaimed ${formattedSol} $SOL using @getfreesol_xyz\n\nReclaim your locked SOL 👇\n${shareUrl}`;
      setTweetText(message);
    }
  }, [isOpen, solClaimed, shareUrl]);

  const generateCardImage = async (): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const width = 1200;
    const height = 675;
    canvas.width = width;
    canvas.height = height;

    const bgGradient = ctx.createLinearGradient(0, 0, width, 0);
    bgGradient.addColorStop(0, '#1a0a2e');
    bgGradient.addColorStop(0.5, '#2d1b4e');
    bgGradient.addColorStop(1, '#1a0a2e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    const diagonalGradient = ctx.createLinearGradient(width * 0.6, 0, width, height);
    diagonalGradient.addColorStop(0, 'rgba(147, 51, 234, 0.4)');
    diagonalGradient.addColorStop(1, 'rgba(107, 33, 168, 0.6)');
    ctx.fillStyle = diagonalGradient;
    ctx.beginPath();
    ctx.moveTo(width * 0.67, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, height);
    ctx.lineTo(width * 0.33, height);
    ctx.closePath();
    ctx.fill();

    const logo = new Image();
    logo.crossOrigin = 'anonymous';
    await new Promise<void>((resolve) => {
      logo.onload = () => resolve();
      logo.onerror = () => resolve();
      logo.src = logoImage;
    });
    if (logo.complete && logo.naturalWidth > 0) {
      ctx.drawImage(logo, 50, 45, 90, 90);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('GET FREE SOL', 160, 105);

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 80px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CLAIMED', width / 2, 280);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px Arial, sans-serif';
    ctx.fillText(`+ ${solClaimed.toFixed(4)} SOL`, width / 2, 420);

    ctx.fillStyle = '#4ade80';
    ctx.font = '36px Courier New, monospace';
    ctx.fillText(getClaimText(), width / 2, 510);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!);
      }, 'image/png');
    });
  };
  
  const handleShareOnX = async () => {
    setCopying(true);
    try {
      const imageBlob = await generateCardImage();
      
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': imageBlob
          })
        ]);
        toast({
          title: "Image copied!",
          description: "Paste (Ctrl+V) the image into your tweet",
        });
      } catch (clipboardError) {
        console.error('Clipboard write failed:', clipboardError);
        toast({
          title: "Opening Twitter",
          description: "Right-click and save the card image to upload manually",
          variant: "destructive"
        });
      }
      
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      window.open(twitterUrl, '_blank', 'width=550,height=420');
    } catch (error) {
      console.error('Error generating image:', error);
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      window.open(twitterUrl, '_blank', 'width=550,height=420');
    } finally {
      setCopying(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-transparent border-0 p-0 [&>button]:hidden">
        <div className="space-y-4">
          <div 
            ref={cardRef}
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
            <button 
              onClick={handleShareOnX}
              disabled={copying}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-400 hover:bg-green-300 border-2 border-green-300 rounded-lg px-6 py-2 transition-colors z-10 disabled:opacity-50"
            >
              <span className="text-black font-mono font-bold text-base">
                {copying ? "Copying..." : "Tweet It"}
              </span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

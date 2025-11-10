import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Flame, X, DollarSign } from 'lucide-react';

interface BurnAsset {
  name: string;
  symbol?: string;
  amount?: string;
  solValue?: number;
  usdValue?: number;
  mint?: string;
  isHighValue?: boolean;
}

interface BurnConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  assets: BurnAsset[];
  type: 'token' | 'nft';
  totalSolValue?: number;
  totalUsdValue?: number;
}

const HIGH_VALUE_THRESHOLD_SOL = 0.1; // Warn if any single asset is worth more than 0.1 SOL
const HIGH_VALUE_THRESHOLD_USD = 20; // Warn if any single asset is worth more than $20

export function BurnConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  assets,
  type,
  totalSolValue = 0,
  totalUsdValue = 0,
}: BurnConfirmationModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [highValueConfirmed, setHighValueConfirmed] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [canConfirm, setCanConfirm] = useState(false);

  // Check if there are any high-value assets
  const hasHighValueAssets = assets.some(
    asset =>
      (asset.solValue && asset.solValue >= HIGH_VALUE_THRESHOLD_SOL) ||
      (asset.usdValue && asset.usdValue >= HIGH_VALUE_THRESHOLD_USD)
  );

  const highValueAssets = assets.filter(
    asset =>
      (asset.solValue && asset.solValue >= HIGH_VALUE_THRESHOLD_SOL) ||
      (asset.usdValue && asset.usdValue >= HIGH_VALUE_THRESHOLD_USD)
  );

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      setUnderstood(false);
      setHighValueConfirmed(false);
      setCountdown(5);
      setCanConfirm(false);
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || countdown === 0) return;

    const timer = setTimeout(() => {
      setCountdown(prev => {
        if (prev === 1) {
          setCanConfirm(true);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOpen, countdown]);

  // Check if all safety conditions are met
  const allConditionsMet =
    canConfirm &&
    understood &&
    confirmText.toUpperCase() === 'BURN' &&
    (!hasHighValueAssets || highValueConfirmed);

  const handleConfirm = () => {
    if (allConditionsMet) {
      onConfirm();
      onClose();
    }
  };

  const handleCancel = () => {
    setConfirmText('');
    setUnderstood(false);
    setHighValueConfirmed(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-2xl bg-gradient-to-br from-gray-900 via-red-900/20 to-gray-900 border-2 border-red-500">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl font-bold text-white">
            <AlertTriangle className="h-8 w-8 text-red-500 animate-pulse" />
            PERMANENT & IRREVERSIBLE ACTION
          </DialogTitle>
          <DialogDescription className="text-red-300 text-base mt-2">
            You are about to permanently destroy {assets.length} {type === 'token' ? 'token' : 'NFT'}
            {assets.length !== 1 ? 's' : ''}. This action CANNOT be undone!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Critical Warning Box */}
          <div className="bg-red-950/50 border-2 border-red-500 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Flame className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" />
              <div className="space-y-2">
                <p className="text-white font-bold text-lg">⚠️ WARNING: BURNING IS PERMANENT</p>
                <ul className="text-red-200 text-sm space-y-1">
                  <li>• Once burned, these {type === 'token' ? 'tokens' : 'NFTs'} are GONE FOREVER</li>
                  <li>• We CANNOT recover or restore burned assets</li>
                  <li>• This is a blockchain transaction - it is IRREVERSIBLE</li>
                  <li>• You will only receive the small SOL rent deposit back</li>
                </ul>
              </div>
            </div>
          </div>

          {/* High Value Warning (if applicable) */}
          {hasHighValueAssets && (
            <div className="bg-yellow-950/50 border-2 border-yellow-500 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <DollarSign className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-1" />
                <div className="space-y-2">
                  <p className="text-yellow-300 font-bold text-lg">⚠️ HIGH VALUE ASSETS DETECTED!</p>
                  <p className="text-yellow-200 text-sm">
                    You are about to burn {highValueAssets.length} high-value asset
                    {highValueAssets.length !== 1 ? 's' : ''}:
                  </p>
                  <ul className="text-yellow-100 text-sm space-y-1 max-h-32 overflow-y-auto">
                    {highValueAssets.map((asset, idx) => (
                      <li key={idx} className="font-mono">
                        • {asset.name || asset.symbol || 'Unknown'}
                        {asset.solValue && ` (${asset.solValue.toFixed(4)} SOL)`}
                        {asset.usdValue && ` ≈ $${asset.usdValue.toFixed(2)}`}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Assets Summary */}
          <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
            <h4 className="text-white font-semibold mb-3">
              {type === 'token' ? 'Tokens' : 'NFTs'} to Burn ({assets.length})
            </h4>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {assets.slice(0, 20).map((asset, idx) => (
                <div key={idx} className="text-sm text-gray-300 font-mono flex justify-between">
                  <span className="truncate flex-1">{asset.name || asset.symbol || 'Unknown'}</span>
                  {asset.amount && <span className="ml-2">{asset.amount}</span>}
                </div>
              ))}
              {assets.length > 20 && (
                <p className="text-gray-400 text-xs italic">...and {assets.length - 20} more</p>
              )}
            </div>
            {(totalSolValue > 0 || totalUsdValue > 0) && (
              <div className="mt-3 pt-3 border-t border-gray-600 text-sm text-gray-300">
                <p>
                  Estimated rent recovery: {totalSolValue.toFixed(6)} SOL
                  {totalUsdValue > 0 && ` (≈ $${totalUsdValue.toFixed(2)})`}
                </p>
              </div>
            )}
          </div>

          {/* Safety Checkboxes */}
          <div className="space-y-4">
            <div className="flex items-start space-x-3 bg-gray-800/50 p-4 rounded-lg border border-gray-600">
              <Checkbox
                id="understand"
                checked={understood}
                onCheckedChange={(checked) => setUnderstood(checked as boolean)}
                className="mt-1"
                data-testid="checkbox-understand-permanent"
              />
              <label
                htmlFor="understand"
                className="text-sm text-gray-200 font-medium cursor-pointer leading-relaxed"
              >
                I understand this burn is <span className="text-red-400 font-bold">PERMANENT and IRREVERSIBLE</span>.
                These {type === 'token' ? 'tokens' : 'NFTs'} will be destroyed forever and cannot be recovered by anyone.
              </label>
            </div>

            {hasHighValueAssets && (
              <div className="flex items-start space-x-3 bg-yellow-950/30 p-4 rounded-lg border border-yellow-600">
                <Checkbox
                  id="highValue"
                  checked={highValueConfirmed}
                  onCheckedChange={(checked) => setHighValueConfirmed(checked as boolean)}
                  className="mt-1"
                  data-testid="checkbox-high-value"
                />
                <label
                  htmlFor="highValue"
                  className="text-sm text-yellow-200 font-medium cursor-pointer leading-relaxed"
                >
                  I confirm I want to burn high-value assets worth more than $
                  {HIGH_VALUE_THRESHOLD_USD}. I understand I am giving up their value permanently.
                </label>
              </div>
            )}
          </div>

          {/* Type BURN Confirmation */}
          <div className="space-y-2">
            <label htmlFor="confirmText" className="text-sm text-gray-300 font-medium">
              Type <span className="text-red-400 font-bold">BURN</span> to confirm:
            </label>
            <Input
              id="confirmText"
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Type BURN in capital letters"
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-500"
              data-testid="input-confirm-burn"
            />
            {confirmText && confirmText.toUpperCase() !== 'BURN' && (
              <p className="text-red-400 text-xs">Must type exactly "BURN" in capital letters</p>
            )}
          </div>

          {/* Countdown Timer */}
          {countdown > 0 && (
            <div className="bg-blue-950/50 border border-blue-500 rounded-lg p-3 text-center">
              <p className="text-blue-300 text-sm">
                Safety delay: Please wait <span className="font-bold text-lg">{countdown}</span> second
                {countdown !== 1 ? 's' : ''}...
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-3">
          <Button
            onClick={handleCancel}
            variant="outline"
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white border-gray-500"
            data-testid="button-cancel-burn"
          >
            <X className="h-4 w-4 mr-2" />
            CANCEL (Keep My Assets)
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!allConditionsMet}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-confirm-burn"
          >
            <Flame className="h-4 w-4 mr-2" />
            {countdown > 0 ? `Wait ${countdown}s` : 'CONFIRM BURN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

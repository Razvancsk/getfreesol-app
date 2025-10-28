import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Flame } from 'lucide-react';

interface BurnConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  tokenCount: number;
  estimatedSOL: string;
  tokenDetails?: Array<{ symbol: string; name: string; amount?: string; uiAmount?: number }>;
}

export function BurnConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  tokenCount,
  estimatedSOL,
  tokenDetails = [],
}: BurnConfirmationDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setConfirmText('');
    }
    onOpenChange(newOpen);
  };

  const handleConfirm = () => {
    if (confirmText === 'BURN') {
      setConfirmText('');
      onConfirm();
      onOpenChange(false);
    }
  };

  const isConfirmValid = confirmText === 'BURN';

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="bg-gradient-to-br from-slate-900 via-red-900/20 to-slate-900 border-red-500/30 max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-600/20 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <AlertDialogTitle className="text-xl text-white">
              ⚠️ PERMANENT ACTION
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-4 pt-2">
            <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-4 space-y-2">
              <p className="text-red-200 font-semibold text-base">
                You are about to BURN {tokenCount} token{tokenCount > 1 ? 's' : ''}
              </p>
              
              {tokenDetails.length > 0 && (
                <div className={`space-y-1 mt-3 ${tokenDetails.length > 5 ? 'max-h-40 overflow-y-auto pr-2' : ''}`}>
                  {tokenDetails.map((token, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm text-red-300">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Flame className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{token.symbol || token.name}</span>
                      </div>
                      {token.uiAmount !== undefined && (
                        <span className="font-semibold ml-2 flex-shrink-0">{token.uiAmount.toLocaleString()}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              <p className="text-red-300 text-sm mt-3">
                You will receive ~{estimatedSOL} SOL rent back
              </p>
            </div>

            <div className="space-y-2 text-sm text-purple-200">
              <p className="font-semibold text-red-400">
                ⚠️ THIS ACTION IS IRREVERSIBLE AND PERMANENT
              </p>
              <ul className="list-disc list-inside space-y-1 text-purple-300">
                <li>Tokens will be destroyed forever</li>
                <li>This CANNOT be undone</li>
                <li>No one can recover burned tokens</li>
              </ul>
            </div>

            <div className="bg-slate-950/60 border border-purple-500/20 rounded-lg p-3">
              <p className="text-purple-200 text-sm mb-2">
                Type <span className="font-bold text-red-400">BURN</span> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Type BURN"
                className="bg-slate-900 border-purple-500/30 text-white text-center font-bold text-lg"
                autoFocus
                data-testid="input-burn-confirmation"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel 
            className="bg-purple-900/60 hover:bg-purple-800/70 text-white border-purple-600/40 w-full sm:w-auto"
            data-testid="button-cancel-burn"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isConfirmValid}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            data-testid="button-confirm-burn"
          >
            <Flame className="h-4 w-4 mr-2" />
            BURN FOREVER
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

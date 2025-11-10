import { useState, useCallback } from 'react';

interface BurnAsset {
  name: string;
  symbol?: string;
  amount?: string;
  solValue?: number;
  usdValue?: number;
  mint?: string;
  isHighValue?: boolean;
}

interface UseBurnConfirmationOptions {
  type: 'token' | 'nft';
  onConfirm: () => void;
}

export function useBurnConfirmation({ type, onConfirm }: UseBurnConfirmationOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [assets, setAssets] = useState<BurnAsset[]>([]);
  const [totalSolValue, setTotalSolValue] = useState(0);
  const [totalUsdValue, setTotalUsdValue] = useState(0);

  const requestConfirmation = useCallback(
    (burnAssets: BurnAsset[], solValue = 0, usdValue = 0) => {
      setAssets(burnAssets);
      setTotalSolValue(solValue);
      setTotalUsdValue(usdValue);
      setIsOpen(true);
    },
    []
  );

  const handleConfirm = useCallback(() => {
    onConfirm();
    setIsOpen(false);
    setAssets([]);
    setTotalSolValue(0);
    setTotalUsdValue(0);
  }, [onConfirm]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setAssets([]);
    setTotalSolValue(0);
    setTotalUsdValue(0);
  }, []);

  return {
    isOpen,
    assets,
    totalSolValue,
    totalUsdValue,
    type,
    requestConfirmation,
    handleConfirm,
    handleClose,
  };
}

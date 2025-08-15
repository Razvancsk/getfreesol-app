import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export function useLedgerWallet() {
  const { wallet, connected, connecting, publicKey } = useWallet();
  const [isLedger, setIsLedger] = useState(false);
  const [ledgerStatus, setLedgerStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [browserSupported, setBrowserSupported] = useState(false);

  // Check if browser supports WebHID (required for Ledger)
  useEffect(() => {
    const checkWebHIDSupport = () => {
      const hasWebHID = 'hid' in navigator;
      const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
      const isEdge = /Edg/.test(navigator.userAgent);
      
      setBrowserSupported(hasWebHID && (isChrome || isEdge));
    };

    checkWebHIDSupport();
  }, []);

  // Monitor wallet connection and detect if it's Ledger
  useEffect(() => {
    if (wallet && wallet.adapter) {
      const isLedgerWallet = wallet.adapter.name.toLowerCase().includes('ledger');
      setIsLedger(isLedgerWallet);
      
      if (isLedgerWallet) {
        if (connecting) {
          setLedgerStatus('connecting');
        } else if (connected && publicKey) {
          setLedgerStatus('connected');
        } else {
          setLedgerStatus('disconnected');
        }
      }
    } else {
      setIsLedger(false);
      setLedgerStatus('disconnected');
    }
  }, [wallet, connected, connecting, publicKey]);

  const getLedgerInfo = useCallback(() => {
    if (!isLedger) return null;

    return {
      isConnected: connected,
      publicKey: publicKey?.toBase58(),
      status: ledgerStatus,
      browserSupported,
      requirements: {
        webHID: 'hid' in navigator,
        supportedBrowser: browserSupported,
        solanaApp: 'Install Solana app on Ledger device',
        blindSigning: 'Enable "Blind signing" in Ledger Solana app settings'
      }
    };
  }, [isLedger, connected, publicKey, ledgerStatus, browserSupported]);

  const ledgerInstructions = {
    setup: [
      'Connect your Ledger device to USB',
      'Unlock the device with your PIN',
      'Open the Solana app on your Ledger',
      'Enable "Blind signing" in Solana app settings',
      'Click "Connect Wallet" and select Ledger'
    ],
    transaction: [
      'Review transaction details on Ledger screen',
      'Press both buttons to approve',
      'Wait for transaction confirmation',
      'Keep device connected until completion'
    ],
    troubleshooting: [
      'Ensure Ledger device is unlocked',
      'Check Solana app is open and updated',
      'Verify "Blind signing" is enabled',
      'Try different USB port or cable',
      'Close other apps using the Ledger'
    ]
  };

  return {
    isLedger,
    ledgerStatus,
    browserSupported,
    getLedgerInfo,
    ledgerInstructions,
    isLedgerConnected: isLedger && connected,
    isLedgerConnecting: isLedger && connecting
  };
}
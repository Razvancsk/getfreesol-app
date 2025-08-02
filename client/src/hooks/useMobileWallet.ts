import { useCallback } from 'react';

interface MobileWalletConfig {
  walletName: string;
  deepLinkPrefix: string;
  universalLink: string;
  appStoreUrl: string;
  playStoreUrl: string;
}

const MOBILE_WALLETS: Record<string, MobileWalletConfig> = {
  'Phantom': {
    walletName: 'Phantom',
    deepLinkPrefix: 'phantom://browse/',
    universalLink: 'https://phantom.app/ul/browse/',
    appStoreUrl: 'https://apps.apple.com/us/app/phantom-solana-wallet/id1598432977',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=app.phantom',
  },
  'Solflare': {
    walletName: 'Solflare', 
    deepLinkPrefix: 'solflare://browse/',
    universalLink: 'https://solflare.com/ul/browse/',
    appStoreUrl: 'https://apps.apple.com/us/app/solflare/id1580902717',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.solflare.mobile',
  },
  'Trust Wallet': {
    walletName: 'Trust Wallet',
    deepLinkPrefix: 'trust://wallet_connect?coin_id=501&url=',
    universalLink: 'https://link.trustwallet.com/open_url?coin_id=501&url=',
    appStoreUrl: 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp',
  },
  'Magic Eden': {
    walletName: 'Magic Eden',
    deepLinkPrefix: 'magiceden://browse/',
    universalLink: 'https://wallet.magiceden.io/ul/browse/',
    appStoreUrl: 'https://apps.apple.com/us/app/magic-eden/id1608952717',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=io.magiceden.wallet',
  },
  'Backpack': {
    walletName: 'Backpack',
    deepLinkPrefix: 'backpack://browse/',
    universalLink: 'https://backpack.app/ul/browse/',
    appStoreUrl: 'https://apps.apple.com/us/app/backpack-crypto-wallet/id1640834422',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=app.backpack.mobile',
  },
};

export const useMobileWallet = () => {
  const isMobile = useCallback(() => {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }, []);

  const isIOS = useCallback(() => {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }, []);

  const isAndroid = useCallback(() => {
    return /Android/i.test(navigator.userAgent);
  }, []);

  const openWalletApp = useCallback((walletName: string, redirectUrl?: string) => {
    const wallet = MOBILE_WALLETS[walletName];
    if (!wallet || !isMobile()) {
      console.log(`No mobile configuration for ${walletName} or not on mobile device`);
      return false;
    }

    const targetUrl = redirectUrl || window.location.href;
    const encodedUrl = encodeURIComponent(targetUrl);
    
    console.log(`📱 Opening ${walletName} app on mobile...`);

    try {
      // Try deep link first
      const deepLink = wallet.deepLinkPrefix + encodedUrl;
      console.log(`🔗 Attempting deep link: ${deepLink}`);
      
      // Create hidden iframe for deep link attempt
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = deepLink;
      document.body.appendChild(iframe);
      
      // Clean up iframe after attempt
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);

      // Also try window.location as fallback
      setTimeout(() => {
        window.location.href = deepLink;
      }, 500);

      // If deep link fails, try universal link
      setTimeout(() => {
        const universalLink = wallet.universalLink + encodedUrl;
        console.log(`🌐 Falling back to universal link: ${universalLink}`);
        window.location.href = universalLink;
      }, 2000);

      // Finally, redirect to app store if wallet not installed
      setTimeout(() => {
        const storeUrl = isIOS() ? wallet.appStoreUrl : wallet.playStoreUrl;
        console.log(`🏪 Redirecting to app store: ${storeUrl}`);
        window.open(storeUrl, '_blank');
      }, 4000);

      return true;
    } catch (error) {
      console.error(`Failed to open ${walletName} app:`, error);
      return false;
    }
  }, [isMobile, isIOS]);

  const handleMobileTransaction = useCallback(async (
    walletName: string, 
    signTransaction: () => Promise<any>,
    onMobileRedirect?: () => void
  ) => {
    if (!isMobile()) {
      // Not mobile, use normal signing
      return await signTransaction();
    }

    console.log(`📱 Mobile transaction signing for ${walletName}`);

    // For mobile devices, we need to handle transaction signing differently
    // depending on whether we're in the wallet's browser or external browser
    
    const isInWalletBrowser = checkWalletBrowser(walletName);
    
    if (isInWalletBrowser) {
      console.log(`✅ In ${walletName} browser, using direct signing`);
      return await signTransaction();
    } else {
      console.log(`📱 External browser detected, redirecting to ${walletName} app`);
      
      // Store transaction data and redirect to wallet app
      if (onMobileRedirect) {
        onMobileRedirect();
      }
      
      // Generate a unique session ID for transaction continuity
      const sessionId = Date.now().toString();
      localStorage.setItem('pendingTransaction', sessionId);
      
      // Redirect to wallet app
      const redirectUrl = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
      openWalletApp(walletName, redirectUrl);
      
      // Return promise that will be resolved when user returns to app
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Transaction signing timeout'));
        }, 300000); // 5 minute timeout
        
        const checkCompletion = () => {
          const completed = localStorage.getItem(`transaction_${sessionId}`);
          if (completed) {
            clearTimeout(timeoutId);
            localStorage.removeItem(`transaction_${sessionId}`);
            localStorage.removeItem('pendingTransaction');
            resolve(JSON.parse(completed));
          } else {
            setTimeout(checkCompletion, 1000);
          }
        };
        
        checkCompletion();
      });
    }
  }, [isMobile, openWalletApp]);

  const checkWalletBrowser = useCallback((walletName: string): boolean => {
    const userAgent = navigator.userAgent.toLowerCase();
    
    switch (walletName) {
      case 'Phantom':
        return userAgent.includes('phantom');
      case 'Solflare':
        return userAgent.includes('solflare');
      case 'Trust Wallet':
        return userAgent.includes('trustwallet');
      case 'Magic Eden':
        return userAgent.includes('magiceden');
      case 'Backpack':
        return userAgent.includes('backpack');
      default:
        return false;
    }
  }, []);

  const showMobileInstructions = useCallback((walletName: string) => {
    if (!isMobile()) return false;
    
    const wallet = MOBILE_WALLETS[walletName];
    if (!wallet) return false;

    const instructions = `
      To complete this transaction:
      1. Tap the button below to open ${walletName}
      2. Review and approve the transaction in ${walletName}
      3. You'll be brought back to this page automatically
    `;
    
    return instructions;
  }, [isMobile]);

  return {
    isMobile: isMobile(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    openWalletApp,
    handleMobileTransaction,
    checkWalletBrowser,
    showMobileInstructions,
    supportedWallets: Object.keys(MOBILE_WALLETS),
  };
};
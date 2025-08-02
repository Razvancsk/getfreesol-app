// Mobile wallet utilities for deep linking and transaction handling

export const isMobileDevice = (): boolean => {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

export const isIOS = (): boolean => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

export const isAndroid = (): boolean => {
  return /Android/i.test(navigator.userAgent);
};

export const encodeTransactionForDeepLink = (transaction: any): string => {
  // Convert transaction to base64 for deep linking
  return Buffer.from(transaction.serialize()).toString('base64');
};

export const createPhantomDeepLink = (transaction: string, redirectUrl?: string): string => {
  const baseUrl = redirectUrl || window.location.href;
  const encodedUrl = encodeURIComponent(baseUrl);
  
  // Phantom mobile deep link format
  return `phantom://v1/signTransaction?transaction=${transaction}&redirect=${encodedUrl}`;
};

export const createSolflareDeepLink = (transaction: string, redirectUrl?: string): string => {
  const baseUrl = redirectUrl || window.location.href;
  const encodedUrl = encodeURIComponent(baseUrl);
  
  // Solflare mobile deep link format
  return `solflare://signTransaction?transaction=${transaction}&redirect=${encodedUrl}`;
};

export const createTrustWalletDeepLink = (redirectUrl?: string): string => {
  const baseUrl = redirectUrl || window.location.href;
  const encodedUrl = encodeURIComponent(baseUrl);
  
  // Trust Wallet mobile deep link format
  return `trust://wallet_connect?coin_id=501&url=${encodedUrl}`;
};

export const openWalletForSigning = (walletName: string, transaction: any, onSuccess?: () => void, onError?: (error: string) => void): void => {
  if (!isMobileDevice()) {
    onError?.('Not a mobile device');
    return;
  }

  console.log(`📱 Opening ${walletName} app for transaction signing...`);

  try {
    const transactionBase64 = encodeTransactionForDeepLink(transaction);
    let deepLink: string;
    let fallbackUrl: string;

    switch (walletName?.toLowerCase()) {
      case 'phantom':
        deepLink = createPhantomDeepLink(transactionBase64);
        fallbackUrl = isIOS() 
          ? 'https://apps.apple.com/us/app/phantom-solana-wallet/id1598432977'
          : 'https://play.google.com/store/apps/details?id=app.phantom';
        break;
      
      case 'solflare':
        deepLink = createSolflareDeepLink(transactionBase64);
        fallbackUrl = isIOS()
          ? 'https://apps.apple.com/us/app/solflare/id1580902717'
          : 'https://play.google.com/store/apps/details?id=com.solflare.mobile';
        break;
      
      case 'trust wallet':
        deepLink = createTrustWalletDeepLink();
        fallbackUrl = isIOS()
          ? 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409'
          : 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp';
        break;
      
      default:
        onError?.(`Unsupported wallet: ${walletName}`);
        return;
    }

    console.log(`🔗 Opening deep link: ${deepLink}`);

    // Method 1: Try window.location
    window.location.href = deepLink;

    // Method 2: Fallback to app store if wallet not installed
    setTimeout(() => {
      console.log(`🏪 Fallback: Opening app store`);
      window.open(fallbackUrl, '_blank');
    }, 3000);

    // Method 3: Set up return handler for when user comes back
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('📱 User returned to browser, checking transaction status...');
        onSuccess?.();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Clean up listener after 5 minutes
    setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, 300000);

  } catch (error) {
    console.error('Failed to open wallet app:', error);
    onError?.(`Failed to open ${walletName}: ${error}`);
  }
};

// Check if we're in a wallet's browser
export const isInWalletBrowser = (walletName?: string): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (!walletName) {
    return userAgent.includes('phantom') || 
           userAgent.includes('solflare') || 
           userAgent.includes('trustwallet') ||
           userAgent.includes('backpack') ||
           userAgent.includes('magiceden');
  }
  
  switch (walletName.toLowerCase()) {
    case 'phantom':
      return userAgent.includes('phantom');
    case 'solflare':
      return userAgent.includes('solflare');
    case 'trust wallet':
      return userAgent.includes('trustwallet');
    case 'backpack':
      return userAgent.includes('backpack');
    case 'magic eden':
      return userAgent.includes('magiceden');
    default:
      return false;
  }
};
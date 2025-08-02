// Utility to hide Trust Wallet from the wallet selection modal
export const hideTrustWalletFromModal = () => {
  // Wait for modal to be rendered
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        // Check if wallet modal is present
        const modal = document.querySelector('.wallet-adapter-modal');
        if (modal) {
          // Find and hide Trust Wallet buttons
          const buttons = modal.querySelectorAll('button, .wallet-adapter-button');
          buttons.forEach((button) => {
            const text = button.textContent?.toLowerCase() || '';
            const title = button.getAttribute('title')?.toLowerCase() || '';
            const alt = button.querySelector('img')?.getAttribute('alt')?.toLowerCase() || '';
            
            // Hide if it contains "trust"
            if (text.includes('trust') || title.includes('trust') || alt.includes('trust')) {
              (button as HTMLElement).style.display = 'none';
              console.log('🚫 Hidden Trust Wallet from modal');
            }
          });
        }
      }
    });
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Return cleanup function
  return () => observer.disconnect();
};

// Auto-start when module loads
let cleanup: (() => void) | null = null;

export const startTrustWalletHiding = () => {
  if (cleanup) cleanup();
  cleanup = hideTrustWalletFromModal();
};

export const stopTrustWalletHiding = () => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
};
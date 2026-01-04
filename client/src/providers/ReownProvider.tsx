import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana } from "@reown/appkit/networks";
import type { ReactNode } from "react";

// Project ID from Reown Cloud Dashboard
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || "30247a4ea78906563498c2736129d21f";

// Set up Solana Adapter
const solanaWeb3JsAdapter = new SolanaAdapter();

// Get current origin - for replit.dev domains during development
const getCurrentOrigin = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return "https://getfreesol.xyz";
};

// Metadata - URL must match domain configured in Reown Cloud
const metadata = {
  name: "GetFreeSol",
  description: "Reclaim SOL from empty token accounts on Solana",
  url: getCurrentOrigin(),
  icons: ["https://getfreesol.xyz/favicon.ico"],
};

// Create modal
createAppKit({
  adapters: [solanaWeb3JsAdapter],
  networks: [solana],
  projectId,
  metadata,
  features: {
    analytics: true,
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#9333ea",
    "--w3m-border-radius-master": "2px",
  },
});

interface ReownProviderProps {
  children: ReactNode;
}

export function ReownProvider({ children }: ReownProviderProps) {
  return <>{children}</>;
}

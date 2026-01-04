import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana } from "@reown/appkit/networks";
import type { ReactNode } from "react";

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;

if (!projectId) {
  console.warn("VITE_REOWN_PROJECT_ID is not set - wallet connection will not work");
}

const solanaAdapter = new SolanaAdapter();

const metadata = {
  name: "Get Your SOL Back!",
  description: "Reclaim SOL from empty token accounts on Solana",
  url: typeof window !== 'undefined' ? window.location.origin : "https://getfreesol.xyz",
  icons: ["https://getfreesol.xyz/favicon.ico"],
};

createAppKit({
  adapters: [solanaAdapter],
  networks: [solana],
  projectId: projectId || "",
  metadata,
  features: {
    analytics: true,
    email: false,
    socials: [],
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

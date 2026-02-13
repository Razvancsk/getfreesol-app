import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import logoPath from '@assets/image_1757882056840.png';

export default function TermsConditions() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <header className="sticky top-0 z-50 border-b border-purple-700/50 bg-slate-900/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/">
                <button className="bg-purple-700/50 hover:bg-purple-600 text-white border border-purple-500/30 p-2 rounded-lg transition-colors">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              </Link>
              <Link href="/">
                <div className="flex items-center space-x-3 cursor-pointer">
                  <img src={logoPath} alt="GetFreeSol Logo" className="h-8 w-8" />
                  <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    GetFreeSol
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto pt-8 pb-16 max-w-4xl px-4">
        <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Terms and Conditions</h1>
        <p className="text-purple-300 text-sm mb-8">Last updated: February 13, 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By using GetFreeSol, you agree to these Terms. If you do not agree, do not use the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. What GetFreeSol Does</h2>
            <p>
              GetFreeSol helps you reclaim SOL from empty token accounts, burn unwanted tokens and NFTs, swap tokens via Jupiter Ultra API, earn referral commissions, and track engagement points on the Solana blockchain.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Wallet Security</h2>
            <p>
              GetFreeSol uses Reown, a trusted and safe wallet connection provider, to connect your Solana wallet. Reown ensures that nobody — not GetFreeSol, not Reown, not any third party — can ever see or access your private keys, seed phrases, or move your funds. You are responsible for reviewing all transactions before signing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Fees</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-white">Swap Rent Fee:</strong> 15% on rent recovered during swaps</li>
              <li><strong className="text-white">Developer Claims Fee:</strong> 20% on developer referral earnings</li>
              <li><strong className="text-white">Network Fees:</strong> Standard Solana transaction fees paid by the user</li>
            </ul>
            <p className="mt-3">Fees may change at any time.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Transaction Finality</h2>
            <p>
              All blockchain transactions are final and irreversible. This includes account closures, burns, and swaps. Review everything before signing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Prohibited Activities</h2>
            <p>
              Do not use the platform for illegal purposes, exploit or hack the Service, use bots for unfair advantage, abuse the referral or points system, or impersonate others.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Disclaimer & Liability</h2>
            <p className="mb-3">
              THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES. GETFREESOL IS NOT LIABLE FOR ANY LOSSES FROM BLOCKCHAIN TRANSACTIONS, WALLET COMPROMISES, SMART CONTRACT VULNERABILITIES, OR NETWORK FAILURES.
            </p>
            <p>
              Cryptocurrency and DeFi carry inherent financial risks. Token values fluctuate, and past performance does not guarantee future results.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Changes & Contact</h2>
            <p>
              These Terms may be updated at any time. Continued use means acceptance. Access may be suspended for violations. For questions, contact us on X (Twitter) at <a href="https://x.com/getfreesol_xyz" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">@getfreesol_xyz</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

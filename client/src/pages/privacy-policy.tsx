import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import logoPath from '@assets/logo-ELKtyS9R_1776448181410.png';

export default function PrivacyPolicy() {
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
        <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Privacy Policy</h1>
        <p className="text-purple-300 text-sm mb-8">Last updated: February 13, 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. What We Collect</h2>
            <p className="mb-3">
              GetFreeSol uses Reown, a trusted and safe wallet connection provider. When you connect your wallet, we only collect your public wallet address and record transaction data (account closures, burns, swaps, referral activities, and staking positions). All blockchain transactions are publicly visible on the Solana network.
            </p>
            <p className="mb-3">
              For the GSOL staking feature we additionally store: the amount of GSOL you hold, the date your staking position was opened (to calculate loyalty multipliers), your cumulative staking points balance, and whether your one-time welcome bonus has been awarded. No private keys or sensitive personal information are ever collected.
            </p>
            <p>
              For the Coin Flip game we store: your public wallet address, the outcome of each flip (win or loss), the wager amount in SOL, and the on-chain transaction signature. This data is used solely to display your game history and calculate any associated XP rewards. No personally identifiable information beyond your wallet address is collected.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. How We Use It</h2>
            <p>
              Your information is used to operate the platform, process transactions, track points and rewards (including GSOL staking points, loyalty multipliers, and referral bonuses), manage the referral and Developer API programs, and improve the Service. We do not sell or rent your data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Third-Party Services</h2>
            <p>
              GetFreeSol integrates with Solana blockchain, Helius RPC, Jupiter Ultra API, and X (Twitter). These services have their own privacy policies. Your wallet address and transaction data may be processed by these providers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Data Security & Retention</h2>
            <p>
              We use reasonable security measures to protect your data. Transaction records are retained as long as needed to provide the Service. Blockchain data is permanent and cannot be deleted. Your wallet security is your responsibility.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Your Rights</h2>
            <p>
              You can disconnect your wallet at any time. You may request access to, correction of, or deletion of your data (except blockchain records) by contacting us on X (Twitter) at <a href="https://x.com/getfreesol_xyz" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">@getfreesol_xyz</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Changes</h2>
            <p>
              This policy may be updated from time to time. Changes will be posted on this page. Continued use of GetFreeSol after changes constitutes acceptance.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

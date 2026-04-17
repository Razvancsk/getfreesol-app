import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import logoPath from '@assets/logo-ELKtyS9R_1776448181410.png';

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
              GetFreeSol helps you reclaim SOL from empty token accounts, burn unwanted tokens and NFTs, swap tokens via Jupiter Ultra API, stake SOL to receive GSOL (a liquid staking token), earn referral commissions, and track engagement points on the Solana blockchain.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2a. GSOL Staking & Points</h2>
            <p className="mb-3">
              When you stake SOL through GetFreeSol you receive GSOL, a liquid staking token issued by the SP12 single-validator stake pool on Solana mainnet. Staking rewards are auto-compounded and GSOL appreciates in value relative to SOL over time. There is no minimum stake amount and no lock-up period — you may unstake at any time.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-white">Staking Points:</strong> Holding GSOL earns 100 pts per GSOL every 24 hours, awarded automatically at midnight UTC.</li>
              <li><strong className="text-white">Welcome Bonus:</strong> First-time stakers receive a one-time flat bonus of 100 pts, permanently recorded per wallet.</li>
              <li><strong className="text-white">Loyalty Multiplier:</strong> Positions held for more than 30 days earn a 1.5× points multiplier.</li>
              <li><strong className="text-white">Referral Points:</strong> Referrers automatically earn 10% of their referred users' daily staking points.</li>
              <li><strong className="text-white">Early User Bonus:</strong> Wallets that stake before June 2026 earn a 2× early-user multiplier on daily staking points.</li>
            </ul>
            <p className="mt-3">
              Points have no guaranteed monetary value and may be used for future platform rewards at GetFreeSol's sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2b. Coin Flip Game</h2>
            <p className="mb-3">
              GetFreeSol offers a Coin Flip game where you wager SOL on a 50/50 outcome. By playing, you acknowledge and accept the following:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-white">No Guarantee of Winnings:</strong> Each flip is independent with a 50% chance of winning. Past results do not influence future outcomes.</li>
              <li><strong className="text-white">Wager Limits:</strong> Minimum and maximum wager amounts may be set by the platform and are subject to change at any time.</li>
              <li><strong className="text-white">Transaction Finality:</strong> All wagers and payouts are executed on-chain and are irreversible once confirmed. Verify your wager before signing.</li>
              <li><strong className="text-white">XP Rewards:</strong> Playing Coin Flip may award XP points regardless of the outcome. Points have no guaranteed monetary value.</li>
              <li><strong className="text-white">Platform Fee:</strong> A platform fee is deducted from each wager. The exact fee percentage is displayed in the game interface before you confirm.</li>
              <li><strong className="text-white">No Refunds:</strong> Lost wagers cannot be refunded. Do not wager more than you can afford to lose.</li>
              <li><strong className="text-white">Age Restriction:</strong> You must be of legal age in your jurisdiction to participate in games of chance. By playing, you confirm that you meet this requirement.</li>
              <li><strong className="text-white">Jurisdiction:</strong> It is your responsibility to ensure that participating in games of chance is legal in your jurisdiction. GetFreeSol makes no representation as to the legality of the Coin Flip game in any specific jurisdiction.</li>
            </ul>
            <p className="mt-3">
              GetFreeSol is not liable for any financial losses incurred through the Coin Flip game. Play responsibly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Wallet Security</h2>
            <p>
              GetFreeSol uses Reown, a trusted and safe wallet connection provider, to connect your Solana wallet. You are responsible for reviewing all transactions before signing.
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

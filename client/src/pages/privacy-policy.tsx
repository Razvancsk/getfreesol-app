import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import logoPath from '@assets/image_1757882056840.png';

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
            <h2 className="text-xl font-bold text-white mb-3">1. Introduction</h2>
            <p>
              GetFreeSol is a decentralized application built on the Solana blockchain that helps users reclaim SOL from empty token accounts, burn unwanted tokens and NFTs, swap tokens, and participate in other blockchain-related activities. This Privacy Policy explains how information is collected, used, disclosed, and safeguarded when you use GetFreeSol.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Information We Collect</h2>
            <h3 className="text-lg font-semibold text-purple-300 mb-2">2.1 Wallet Information</h3>
            <p className="mb-3">
              When you connect your Solana wallet to our Service, we collect your public wallet address. We never have access to your private keys, seed phrases, or the ability to move funds without your explicit transaction approval.
            </p>
            <h3 className="text-lg font-semibold text-purple-300 mb-2">2.2 Transaction Data</h3>
            <p className="mb-3">
              We record transaction data related to your use of the Service, including but not limited to: account closures, token burns, NFT burns, token swaps, and referral activities. This data is stored in our database for providing the Service, displaying your history, and calculating points and rewards.
            </p>
            <h3 className="text-lg font-semibold text-purple-300 mb-2">2.3 Blockchain Data</h3>
            <p className="mb-3">
              All transactions on the Solana blockchain are publicly visible. Any interaction you perform through our Service will be recorded on the public blockchain ledger, which is outside of our control.
            </p>
            <h3 className="text-lg font-semibold text-purple-300 mb-2">2.4 Automatically Collected Information</h3>
            <p>
              We may automatically collect certain information when you access the Service, including your IP address, browser type, operating system, referring URLs, and usage patterns. This information is used to improve Service performance and user experience.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>To provide, operate, and maintain the Service</li>
              <li>To process transactions you initiate (account closures, burns, swaps)</li>
              <li>To track and display your points, rewards, and transaction history</li>
              <li>To manage the referral program and calculate commissions</li>
              <li>To manage the Developer API platform and referral fee collection</li>
              <li>To post on social media platforms (X/Twitter) when authorized by the platform administrator</li>
              <li>To detect fraud, abuse, and security threats</li>
              <li>To improve and optimize the Service</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Information Sharing and Disclosure</h2>
            <p className="mb-3">We do not sell, trade, or rent your personal information to third parties. We may share information in the following circumstances:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-white">Blockchain:</strong> Transaction data is inherently public on the Solana blockchain.</li>
              <li><strong className="text-white">Service Providers:</strong> We use third-party services such as Helius (RPC provider) and Jupiter (swap aggregation) to operate the Service. These providers may process your wallet address and transaction data.</li>
              <li><strong className="text-white">Legal Requirements:</strong> We may disclose information if required by law, regulation, or legal process.</li>
              <li><strong className="text-white">Leaderboards:</strong> Your wallet address (truncated) and points may appear on public leaderboards within the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Data Security</h2>
            <p>
              We implement reasonable technical and organizational security measures to protect your information. However, no method of electronic transmission or storage is 100% secure. Your wallet security depends on your own practices, including safeguarding your private keys and seed phrases. We are not responsible for any loss resulting from unauthorized access to your wallet.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Third-Party Services</h2>
            <p>
              Our Service integrates with third-party services including Solana blockchain, Helius RPC, Jupiter Ultra API, and X (Twitter). Each of these services has its own privacy policy. We encourage you to review their policies. We are not responsible for the privacy practices of these third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Cookies and Tracking</h2>
            <p>
              We use session cookies to maintain your connection state and preferences. We do not use third-party tracking cookies or analytics services that track users across websites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Data Retention</h2>
            <p>
              We retain transaction records and account data for as long as necessary to provide the Service and comply with legal obligations. Blockchain data is permanently recorded on the Solana network and cannot be deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Your Rights</h2>
            <p className="mb-3">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data (except blockchain records)</li>
              <li>Object to or restrict processing of your data</li>
              <li>Withdraw consent at any time by disconnecting your wallet</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Children's Privacy</h2>
            <p>
              Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected data from a minor, we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last updated" date. Your continued use of the Service after any changes constitutes your acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">12. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us through our official channels on X (Twitter) at <a href="https://x.com/getfreesol_xyz" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">@getfreesol_xyz</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

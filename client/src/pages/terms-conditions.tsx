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
              By accessing or using the GetFreeSol platform (the "Service"), you agree to be bound by these Terms and Conditions ("Terms"). If you do not agree to these Terms, do not use the Service. These Terms constitute a legally binding agreement between you and GetFreeSol.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Eligibility</h2>
            <p>
              You must be at least 18 years of age to use the Service. By using the Service, you represent and warrant that you are at least 18 years old and have the legal capacity to enter into these Terms. You are responsible for ensuring that your use of the Service complies with all laws and regulations applicable to you in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Description of Service</h2>
            <p className="mb-3">GetFreeSol provides the following services on the Solana blockchain:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-white">SOL Reclamation:</strong> Identifying and closing empty token accounts to recover SOL rent deposits.</li>
              <li><strong className="text-white">Token Burning:</strong> Burning unwanted SPL tokens and recovering associated rent.</li>
              <li><strong className="text-white">NFT Burning:</strong> Burning unwanted NFTs and recovering associated rent.</li>
              <li><strong className="text-white">Token Swapping:</strong> Swapping tokens via Jupiter Ultra API integration with MEV rebate sharing.</li>
              <li><strong className="text-white">Referral Program:</strong> Earning commissions by referring new users to the platform.</li>
              <li><strong className="text-white">Developer API:</strong> A platform for developers to integrate GetFreeSol services and earn referral fees.</li>
              <li><strong className="text-white">Points System:</strong> A rewards system that tracks user engagement and activities.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Wallet Connection and Security</h2>
            <p className="mb-3">
              To use the Service, you must connect a compatible Solana wallet. You are solely responsible for:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Maintaining the security of your wallet, private keys, and seed phrases</li>
              <li>All activities that occur through your connected wallet</li>
              <li>Reviewing and approving all transactions before signing them</li>
              <li>Understanding the risks associated with blockchain transactions</li>
            </ul>
            <p className="mt-3">
              We never request or store your private keys or seed phrases. If anyone claims to represent GetFreeSol and asks for your private key, it is a scam.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Fees</h2>
            <p className="mb-3">The Service charges the following fees:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-white">Swap Rent Fee:</strong> 15% fee on rent recovered during swap operations.</li>
              <li><strong className="text-white">Developer Claims Fee:</strong> 20% fee on developer referral earnings when claimed.</li>
              <li><strong className="text-white">Network Fees:</strong> Standard Solana network transaction fees apply to all blockchain transactions and are paid by the user.</li>
            </ul>
            <p className="mt-3">
              We reserve the right to modify fee structures at any time. Changes will be communicated through the Service.
            </p>
          </section>


          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Transaction Finality</h2>
            <p>
              All transactions on the Solana blockchain are final and irreversible. Once a transaction is confirmed on-chain, it cannot be undone, reversed, or refunded. This includes account closures, token burns, NFT burns, and token swaps. You are responsible for carefully reviewing all transaction details before approving them in your wallet.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Referral Program</h2>
            <p className="mb-3">The referral program allows users to earn commissions by referring others. Terms include:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Referral commissions are earned when referred users complete eligible transactions</li>
              <li>Commission rates may vary and are subject to change</li>
              <li>Self-referrals, fake accounts, or any form of abuse will result in disqualification and forfeiture of earnings</li>
              <li>We reserve the right to modify or terminate the referral program at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Developer API</h2>
            <p className="mb-3">Developers using the API agree to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Use the API in accordance with its documentation and rate limits</li>
              <li>Not attempt to manipulate, exploit, or abuse the referral fee system</li>
              <li>Accept the 20% fee on developer referral earnings claims</li>
              <li>Understand that PDA-based referral accounts are derived deterministically from their wallet address</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Prohibited Activities</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Use the Service for any illegal purpose or in violation of any applicable laws</li>
              <li>Attempt to exploit, hack, or manipulate the Service or its smart contracts</li>
              <li>Use bots, scripts, or automated tools to gain an unfair advantage</li>
              <li>Engage in market manipulation, wash trading, or fraudulent activities</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Impersonate another user or misrepresent your identity</li>
              <li>Use the Service to launder money or finance illegal activities</li>
              <li>Abuse the referral or points system through fake accounts or self-referrals</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. WE DO NOT GUARANTEE ANY SPECIFIC RESULTS FROM THE USE OF THE SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">12. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, GETFREESOL AND ITS OPERATORS, DEVELOPERS, AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF FUNDS, DATA, OR PROFITS, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE. THIS INCLUDES BUT IS NOT LIMITED TO: LOSSES FROM BLOCKCHAIN TRANSACTIONS, WALLET COMPROMISES, SMART CONTRACT VULNERABILITIES, NETWORK FAILURES, OR ANY OTHER CAUSE RELATED TO THE USE OF THE SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">13. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless GetFreeSol and its operators, developers, and affiliates from and against any claims, liabilities, damages, losses, and expenses arising out of or in connection with your use of the Service, your violation of these Terms, or your violation of any rights of a third party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">14. Risks</h2>
            <p className="mb-3">By using the Service, you acknowledge the following risks:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Cryptocurrency and DeFi activities carry inherent financial risks</li>
              <li>Token values can fluctuate significantly and you may lose value</li>
              <li>Smart contracts may contain bugs or vulnerabilities</li>
              <li>Blockchain networks may experience congestion, outages, or forks</li>
              <li>Regulatory changes may affect the availability or legality of the Service</li>
              <li>Past performance does not guarantee future results</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">15. Modifications to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated "Last updated" date. Your continued use of the Service after any changes constitutes your acceptance of the revised Terms. It is your responsibility to review these Terms periodically.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">16. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your access to the Service at any time, without notice, for any reason, including but not limited to violation of these Terms or suspected fraudulent activity. Upon termination, your right to use the Service will immediately cease.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">17. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles. Any disputes arising from these Terms or the Service shall be resolved through binding arbitration.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">18. Contact</h2>
            <p>
              If you have any questions about these Terms, please contact us through our official channels on X (Twitter) at <a href="https://x.com/getfreesol_xyz" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">@getfreesol_xyz</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

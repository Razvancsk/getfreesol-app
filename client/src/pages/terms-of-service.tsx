import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="bg-white/10 backdrop-blur-lg border-purple-500/20 text-white">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">End User License Agreement (EULA)</CardTitle>
            <p className="text-center text-purple-200">Last Updated: {new Date().toLocaleDateString()}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-3">1. Acceptance of Terms</h2>
              <p className="text-purple-100">
                By accessing or using Get Your SOL Back! ("the Service"), you agree to be bound by this End User License Agreement ("EULA"). If you do not agree to these terms, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">2. Description of Service</h2>
              <p className="text-purple-100">
                Get Your SOL Back! is a decentralized application (dApp) that helps Solana users:
              </p>
              <ul className="list-disc list-inside space-y-2 text-purple-100 mt-2">
                <li>Reclaim SOL from empty token accounts</li>
                <li>Swap tokens using Jupiter aggregator</li>
                <li>Burn unwanted tokens and NFTs</li>
                <li>View Backpack Exchange lending/borrowing markets</li>
                <li>Use automated SOL reclamation (auto-claim)</li>
                <li>Access developer APIs for referral fees</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">3. User Responsibilities</h2>
              <div className="space-y-3 text-purple-100">
                <p><strong>You are responsible for:</strong></p>
                <ul className="list-disc list-inside space-y-2">
                  <li>Maintaining the security of your wallet and private keys</li>
                  <li>Verifying all transactions before signing</li>
                  <li>Understanding blockchain transaction fees and risks</li>
                  <li>Complying with all applicable laws and regulations</li>
                  <li>Any losses resulting from your actions or negligence</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">4. Wallet Connection & Security</h2>
              <p className="text-purple-100">
                We NEVER ask for your private keys or seed phrases. All transactions require your explicit approval through your connected wallet. You are solely responsible for protecting your wallet credentials.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">5. Fees</h2>
              <div className="space-y-3 text-purple-100">
                <p><strong>Platform Fees:</strong></p>
                <ul className="list-disc list-inside space-y-2">
                  <li>SOL Reclamation: 15% of recovered SOL</li>
                  <li>Token Swaps: 0.50% referral fee</li>
                  <li>Token/NFT Burning: No platform fee (network fees apply)</li>
                  <li>Auto-Claim: Network fees paid by our relayer</li>
                </ul>
                <p className="mt-3">
                  <strong>Network Fees:</strong> All blockchain transactions incur Solana network fees (transaction fees + priority fees), which are paid to validators, not to us.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">6. No Guarantees</h2>
              <p className="text-purple-100">
                The Service is provided "AS IS" without warranties of any kind. We do not guarantee:
              </p>
              <ul className="list-disc list-inside space-y-2 text-purple-100 mt-2">
                <li>Continuous or error-free operation</li>
                <li>Successful transaction execution</li>
                <li>Specific amounts of SOL recovery</li>
                <li>Protection against blockchain vulnerabilities</li>
                <li>Compatibility with all wallets or devices</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">7. Limitation of Liability</h2>
              <p className="text-purple-100">
                To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-purple-100 mt-2">
                <li>Loss of funds due to user error or negligence</li>
                <li>Blockchain network issues or congestion</li>
                <li>Wallet provider failures or security breaches</li>
                <li>Smart contract vulnerabilities</li>
                <li>Changes in token values or market conditions</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">8. Prohibited Uses</h2>
              <p className="text-purple-100">
                You may NOT use the Service to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-purple-100 mt-2">
                <li>Violate any laws or regulations</li>
                <li>Engage in money laundering or terrorist financing</li>
                <li>Manipulate markets or engage in fraud</li>
                <li>Attack or exploit the Service's infrastructure</li>
                <li>Reverse engineer or copy our code without permission</li>
                <li>Spam, harass, or harm other users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">9. Intellectual Property</h2>
              <p className="text-purple-100">
                All content, design, code, and branding are owned by Get Your SOL Back! or our licensors. You may not copy, modify, distribute, or create derivative works without our written permission.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">10. Third-Party Services</h2>
              <p className="text-purple-100">
                Our Service integrates with third-party providers (Jupiter, Backpack, wallet providers, etc.). We are not responsible for their actions, policies, or service interruptions. Your use of third-party services is subject to their own terms and conditions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">11. Auto-Claim Feature</h2>
              <p className="text-purple-100">
                By enabling auto-claim, you grant us permission to scan your wallet and automatically close empty token accounts on your behalf. You can revoke this permission at any time. Auto-claim transactions are processed by our relayer, and you pay no upfront fees—we deduct our 15% fee from recovered SOL.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">12. Privacy</h2>
              <p className="text-purple-100">
                Your use of the Service is also governed by our Privacy Policy. Please review it at{" "}
                <a href="/privacy-policy" className="text-purple-300 underline hover:text-purple-200">
                  getfreesol.xyz/privacy-policy
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">13. Modifications to Terms</h2>
              <p className="text-purple-100">
                We reserve the right to modify this EULA at any time. Material changes will be communicated through our website or Discord. Continued use of the Service after changes constitutes acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">14. Termination</h2>
              <p className="text-purple-100">
                We may suspend or terminate your access to the Service at any time, for any reason, including violation of these terms. You may stop using the Service at any time by disconnecting your wallet.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">15. Dispute Resolution</h2>
              <p className="text-purple-100">
                Any disputes arising from this EULA or your use of the Service shall be resolved through binding arbitration in accordance with applicable laws, rather than in court. You waive your right to participate in class-action lawsuits.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">16. Severability</h2>
              <p className="text-purple-100">
                If any provision of this EULA is found to be unenforceable, the remaining provisions shall remain in full effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">17. Entire Agreement</h2>
              <p className="text-purple-100">
                This EULA, together with our Privacy Policy, constitutes the entire agreement between you and Get Your SOL Back! regarding your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">18. Contact Information</h2>
              <ul className="list-none space-y-1 text-purple-100">
                <li><strong>Website:</strong> https://getfreesol.xyz</li>
                <li><strong>Discord:</strong> Available through our platform</li>
                <li><strong>Twitter/X:</strong> @GetFreeSol</li>
              </ul>
            </section>

            <section className="border-t border-purple-500/30 pt-6">
              <p className="text-sm text-purple-200">
                By using Get Your SOL Back!, you acknowledge that you have read, understood, and agree to be bound by this EULA.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

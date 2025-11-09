import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="bg-white/10 backdrop-blur-lg border-purple-500/20 text-white">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">Privacy Policy</CardTitle>
            <p className="text-center text-purple-200">Last Updated: November 9, 2025</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-3">1. Introduction</h2>
              <p className="text-purple-100">
                Get Your SOL Back! ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our decentralized application (dApp) for reclaiming SOL from empty token accounts on the Solana blockchain.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">2. Information We Collect</h2>
              <div className="space-y-3 text-purple-100">
                <p><strong>Wallet Addresses:</strong> We temporarily process your Solana wallet address to scan for empty token accounts and facilitate SOL reclamation.</p>
                <p><strong>Transaction Data:</strong> We store transaction signatures, amounts recovered, and timestamps for displaying statistics and transaction history.</p>
                <p><strong>Usage Data:</strong> We may collect anonymous usage statistics to improve our service.</p>
                <p><strong>No Personal Information:</strong> We do NOT collect names, email addresses, phone numbers, or any personally identifiable information unless you voluntarily provide it for support purposes.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc list-inside space-y-2 text-purple-100">
                <li>To scan your wallet for empty token accounts</li>
                <li>To process SOL reclamation transactions</li>
                <li>To display transaction history and statistics</li>
                <li>To provide swap, burn, and auto-claim features</li>
                <li>To improve our service and user experience</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">4. Blockchain Transparency</h2>
              <p className="text-purple-100">
                All transactions are recorded on the Solana blockchain, which is public and immutable. Transaction signatures, wallet addresses, and transferred amounts are permanently visible on-chain. This is inherent to blockchain technology and not controlled by us.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">5. Data Security</h2>
              <p className="text-purple-100">
                We implement industry-standard security measures to protect your data. However, no method of transmission over the Internet is 100% secure. We use encrypted connections, secure database practices, and never store your private keys or seed phrases.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">6. Third-Party Services</h2>
              <p className="text-purple-100">
                We integrate with third-party services including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-purple-100 mt-2">
                <li><strong>Solana RPC Providers:</strong> For blockchain interactions</li>
                <li><strong>Jupiter Aggregator:</strong> For token swap functionality</li>
                <li><strong>Wallet Providers:</strong> Phantom, Backpack, Solflare, etc.</li>
                <li><strong>Discord & Twitter/X:</strong> For community features (optional)</li>
              </ul>
              <p className="text-purple-100 mt-2">
                These services have their own privacy policies, which we encourage you to review.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">7. Cookies and Tracking</h2>
              <p className="text-purple-100">
                We may use cookies and similar tracking technologies to enhance user experience, such as remembering your wallet connection preferences. You can disable cookies in your browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">8. Children's Privacy</h2>
              <p className="text-purple-100">
                Our service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">9. Your Rights</h2>
              <p className="text-purple-100">
                You have the right to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-purple-100 mt-2">
                <li>Access your stored transaction data</li>
                <li>Request deletion of your data (where applicable)</li>
                <li>Opt-out of optional features like auto-claim</li>
                <li>Disconnect your wallet at any time</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">10. Changes to This Privacy Policy</h2>
              <p className="text-purple-100">
                We may update this Privacy Policy from time to time. We will notify users of any material changes by updating the "Last Updated" date at the top of this policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">11. Contact Us</h2>
              <p className="text-purple-100">
                If you have questions about this Privacy Policy, please contact us:
              </p>
              <ul className="list-none space-y-1 text-purple-100 mt-2">
                <li><strong>Website:</strong> https://getfreesol.xyz</li>
                <li><strong>Discord:</strong> Available through our platform</li>
                <li><strong>Twitter/X:</strong> @GetFreeSol</li>
              </ul>
            </section>

            <section className="border-t border-purple-500/30 pt-6">
              <p className="text-sm text-purple-200">
                By using Get Your SOL Back!, you acknowledge that you have read and understood this Privacy Policy and agree to its terms.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

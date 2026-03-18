import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Code } from 'lucide-react';
import logoPath from '@assets/image_1757882056840.png';

export default function UserDocs() {
  const [activeDocSection, setActiveDocSection] = useState<'overview' | 'burn-tokens' | 'burn-nfts' | 'referrals' | 'points' | 'staking' | 'developer-api'>('overview');

  const sections = [
    { id: 'overview', title: 'How to Claim SOL' },
    { id: 'burn-tokens', title: 'Burn Tokens' },
    { id: 'burn-nfts', title: 'Burn NFTs' },
    { id: 'referrals', title: 'Referral System' },
    { id: 'points', title: 'Points System' },
    { id: 'staking', title: 'Staking (gSOL)' },
    { id: 'developer-api', title: 'Developer API' }
  ];
  
  const currentIndex = sections.findIndex(s => s.id === activeDocSection);
  const previousSection = currentIndex > 0 ? sections[currentIndex - 1] : null;
  const nextSection = currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-purple-700/50 bg-slate-900/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Back button - visible on mobile */}
              <Link href="/">
                <button className="lg:hidden bg-purple-700/50 hover:bg-purple-600 text-white border border-purple-500/30 p-2 rounded-lg transition-colors">
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

      {/* Main Content */}
      <div className="container mx-auto pt-6 pb-12 max-w-6xl px-4">
        <div className="flex flex-col lg:flex-row gap-6 h-full">
          {/* Left Sidebar Navigation - Hidden on Mobile */}
          <div className="hidden lg:block lg:w-64 flex-shrink-0">
            <div className="lg:sticky top-20 space-y-4">
              <div className="flex flex-col gap-3">
                <Link href="/">
                  <button
                    className="bg-purple-700/50 hover:bg-purple-600 text-white border border-purple-500/30 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors w-fit"
                    data-testid="button-back-from-docs"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                </Link>
                <h2 className="text-white text-lg font-semibold">Documentation</h2>
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveDocSection('overview')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeDocSection === 'overview' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-purple-200 hover:bg-purple-700/30'
                  }`}
                  data-testid="docs-nav-overview"
                >
                  📖 Overview
                </button>
                <div className="pt-3 pb-2 px-3 text-purple-400 text-xs font-semibold uppercase">
                  Features
                </div>
                <button
                  onClick={() => setActiveDocSection('burn-tokens')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeDocSection === 'burn-tokens' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-purple-200 hover:bg-purple-700/30'
                  }`}
                  data-testid="docs-nav-tokens"
                >
                  🔥 Burn Tokens
                </button>
                <button
                  onClick={() => setActiveDocSection('burn-nfts')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeDocSection === 'burn-nfts' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-purple-200 hover:bg-purple-700/30'
                  }`}
                  data-testid="docs-nav-nfts"
                >
                  🎨 Burn NFTs
                </button>
                <button
                  onClick={() => setActiveDocSection('referrals')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeDocSection === 'referrals' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-purple-200 hover:bg-purple-700/30'
                  }`}
                  data-testid="docs-nav-referrals"
                >
                  💰 Referral System
                </button>
                <button
                  onClick={() => setActiveDocSection('points')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeDocSection === 'points' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-purple-200 hover:bg-purple-700/30'
                  }`}
                  data-testid="docs-nav-points"
                >
                  ⭐ Points System
                </button>
                <button
                  onClick={() => setActiveDocSection('staking')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeDocSection === 'staking' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-purple-200 hover:bg-purple-700/30'
                  }`}
                  data-testid="docs-nav-staking"
                >
                  ⚡ Staking (gSOL)
                </button>
                <div className="pt-3 pb-2 px-3 text-purple-400 text-xs font-semibold uppercase">
                  Developers
                </div>
                <button
                  onClick={() => setActiveDocSection('developer-api')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeDocSection === 'developer-api' 
                      ? 'bg-purple-600 text-white' 
                      : 'text-purple-200 hover:bg-purple-700/30'
                  }`}
                  data-testid="docs-nav-api"
                >
                  <Code className="w-4 h-4 inline mr-2" />
                  Developer API
                </button>
              </div>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1">
            {activeDocSection === 'overview' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-white text-2xl font-semibold">How to Claim SOL</h2>
                  <p className="text-purple-200">
                    Complete guide to reclaiming your SOL from empty token accounts
                  </p>
                </div>
                <div className="space-y-6 text-white prose prose-invert max-w-none">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4">1. Connect Your Wallet</h3>
                      <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Click the <strong className="text-white">"Connect"</strong> button in the top right corner</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Select your Solana wallet from the list</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Approve the connection in your wallet</span>
                        </li>
                      </ul>
                      <p className="text-purple-200 leading-relaxed mb-6">
                        We support <strong className="text-white">8 different wallets</strong>: Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763872863603.png', import.meta.url).href}
                            alt="GetFreeSol main page - Click Connect button" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 1: Click "Connect" button</p>
                        </div>
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763872748597.png', import.meta.url).href}
                            alt="Wallet selection modal - Choose your wallet" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 2: Select your wallet</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4">2. Claim Your SOL</h3>
                      <p className="text-purple-200 leading-relaxed mb-4">
                        After connecting your wallet, the app will <strong className="text-white">automatically scan and close all empty accounts</strong>. The process is fully automated:
                      </p>
                      <ul className="space-y-3 text-purple-200 leading-relaxed">
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">▸</span>
                          <span>The app automatically detects all empty token accounts</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">▸</span>
                          <span>Up to <strong className="text-white">20 accounts per transaction</strong> will be closed automatically</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">▸</span>
                          <span>Simply <strong className="text-white">approve the transaction</strong> in your wallet</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">▸</span>
                          <span>Receive your reclaimed SOL instantly!</span>
                        </li>
                      </ul>
                      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mt-4">
                        <p className="text-sm text-purple-200">
                          <strong className="text-white">Note:</strong> If you have more than 20 empty accounts, the app will process them in batches. Just approve each transaction until all accounts are closed.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763873482444.png', import.meta.url).href}
                            alt="Scan results showing empty accounts - Click Claim All button" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 1: Click "CLAIM ALL"</p>
                        </div>
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763873493603.png', import.meta.url).href}
                            alt="Transaction confirmation modal in wallet" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 2: Confirm transaction</p>
                        </div>
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763873559520.png', import.meta.url).href}
                            alt="Success message showing SOL claimed" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 3: SOL claimed!</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-3">Additional Features</h3>
                      <ul className="space-y-3 text-purple-200">
                        <li className="flex items-start gap-3">
                          <span className="text-2xl">🔥</span>
                          <div>
                            <strong className="text-white">Burn Tokens:</strong> Remove unwanted tokens from your wallet and recover SOL from the token accounts
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-2xl">🎨</span>
                          <div>
                            <strong className="text-white">Burn NFTs:</strong> Burn NFTs including compressed NFTs (cNFTs), programmable NFTs (pNFTs), and even frozen NFTs
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-2xl">💰</span>
                          <div>
                            <strong className="text-white">Referrals:</strong> Share your referral code and earn 50% commission from fees collected through your referrals
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-2xl">⭐</span>
                          <div>
                            <strong className="text-white">Points:</strong> Earn 20 points for every account closed. Compete on the leaderboard for top rankings!
                          </div>
                        </li>
                      </ul>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-3">Pro Tips</h3>
                      <ul className="space-y-2 text-purple-200 list-disc list-inside">
                        <li>Use the Auto-Claim feature to automatically recover SOL from new empty accounts</li>
                        <li>Check the Statistics tab to see total SOL recovered across the platform</li>
                        <li>Enable notifications to get alerts when new claimable SOL is detected</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeDocSection === 'burn-tokens' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-white text-2xl font-semibold">How to Burn Tokens</h2>
                  <p className="text-purple-200">
                    Remove unwanted tokens from your wallet and recover SOL from token accounts
                  </p>
                </div>
                <div className="space-y-6 text-white prose prose-invert max-w-none">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4">What is Token Burning?</h3>
                      <p className="text-purple-200 leading-relaxed">
                        Token burning allows you to <strong className="text-white">permanently destroy unwanted tokens</strong> from your wallet 
                        and <strong className="text-white">recover SOL</strong> from the token accounts. This helps clean up your wallet and 
                        reclaim rent deposits.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="text-2xl">🔥</span> How to Burn Tokens
                      </h3>
                      <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                        <li className="flex items-start gap-3">
                          <span className="text-orange-400 mt-1">▸</span>
                          <span>Navigate to the <strong className="text-white">"Burn Tokens"</strong> tab</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-orange-400 mt-1">▸</span>
                          <span>Use the <strong className="text-white">value slider</strong> to filter tokens by worth (up to $1, $10, $30, $100, or All)</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-orange-400 mt-1">▸</span>
                          <span>Select the tokens you want to burn (or click <strong className="text-white">"Select All"</strong>)</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-orange-400 mt-1">▸</span>
                          <span>Click <strong className="text-white">"BURN"</strong> to create the transaction</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-orange-400 mt-1">▸</span>
                          <span>Confirm the transaction in your wallet</span>
                        </li>
                      </ul>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763874192116.png', import.meta.url).href}
                            alt="Token burning interface with value slider and token selection" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 1: Select tokens and click "BURN"</p>
                        </div>
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763874201656.png', import.meta.url).href}
                            alt="Transaction confirmation showing token burn" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 2: Confirm the burn transaction</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-3">Pro Tips</h3>
                      <ul className="space-y-2 text-purple-200 list-disc list-inside">
                        <li>Start with low-value tokens to test the feature before burning higher-value tokens</li>
                        <li>The value slider helps you quickly filter out spam tokens worth almost nothing</li>
                        <li>Burning tokens is permanent - make sure you really don't want them!</li>
                        <li>You recover ~0.00203928 SOL per token account closed</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeDocSection === 'burn-nfts' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-white text-2xl font-semibold">How to Burn NFTs</h2>
                  <p className="text-purple-200">
                    Burn unwanted NFTs (including compressed NFTs and frozen NFTs) and recover SOL
                  </p>
                </div>
                <div className="space-y-6 text-white prose prose-invert max-w-none">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4">What is NFT Burning?</h3>
                      <p className="text-purple-200 leading-relaxed">
                        NFT burning allows you to <strong className="text-white">permanently destroy unwanted NFTs</strong> from your wallet 
                        and <strong className="text-white">recover SOL</strong> from the NFT accounts. Our platform supports:
                      </p>
                      <ul className="space-y-3 text-purple-200 leading-relaxed">
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span><strong className="text-white">Regular NFTs:</strong> Standard Metaplex NFTs</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span><strong className="text-white">Compressed NFTs (cNFTs):</strong> Cost-efficient NFTs using Merkle trees</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span><strong className="text-white">Programmable NFTs (pNFTs):</strong> NFTs with royalty enforcement</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span><strong className="text-white">Frozen NFTs:</strong> Even NFTs with frozen accounts can be burned</span>
                        </li>
                      </ul>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4">How to Burn NFTs</h3>
                      <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                        <li className="flex items-start gap-3">
                          <span className="text-pink-400 mt-1">▸</span>
                          <span>Navigate to the <strong className="text-white">"Burn NFT"</strong> tab</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-pink-400 mt-1">▸</span>
                          <span>Choose between <strong className="text-white">"NFTs"</strong> or <strong className="text-white">"cNFTs"</strong> (compressed NFTs) tabs</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-pink-400 mt-1">▸</span>
                          <span>Browse your NFT collection and select the ones you want to burn</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-pink-400 mt-1">▸</span>
                          <span>Click the <strong className="text-white">checkbox</strong> on each NFT you want to burn</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-pink-400 mt-1">▸</span>
                          <span>Click <strong className="text-white">"BURN"</strong> button at the bottom</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-pink-400 mt-1">▸</span>
                          <span>Confirm the transaction in your wallet - you'll see the SOL you'll recover!</span>
                        </li>
                      </ul>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763880886408.png', import.meta.url).href}
                            alt="NFT burning interface showing available NFTs" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 1: Browse your NFTs</p>
                        </div>
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763880899559.png', import.meta.url).href}
                            alt="Selected NFT ready to burn" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 2: Select NFT and click "BURN"</p>
                        </div>
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763881281359.png', import.meta.url).href}
                            alt="Transaction confirmation showing SOL recovered" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Step 3: Confirm and recover SOL!</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-3">Pro Tips</h3>
                      <ul className="space-y-2 text-purple-200 list-disc list-inside">
                        <li>Check both NFTs and cNFTs tabs - you might have compressed NFTs you weren't aware of</li>
                        <li>The platform shows you exactly how much SOL you'll recover before you confirm</li>
                        <li>You can use "Select All NFTs" to quickly select all unwanted NFTs at once</li>
                        <li>Burning NFTs is permanent and cannot be undone - make absolutely sure you want to burn them!</li>
                        <li>Even frozen or locked NFTs can be burned using our advanced burn mechanism</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeDocSection === 'referrals' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-white text-2xl font-semibold">Referral System</h2>
                  <p className="text-purple-200">
                    Earn 50% commission from your referrals - the highest rate in the market!
                  </p>
                </div>
                <div className="space-y-6 text-white prose prose-invert max-w-none">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4">How the Referral System Works</h3>
                      <p className="text-purple-200 leading-relaxed mb-4">
                        Share your unique referral link with friends and earn <strong className="text-white">50% commission</strong> on all fees 
                        collected from users who sign up through your link. This is the <strong className="text-white">highest commission rate in the market</strong>!
                      </p>
                      <ul className="space-y-3 text-purple-200 leading-relaxed">
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span><strong className="text-white">50% commission</strong> on all fees from your referrals</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span>Automatic tracking of all referral transactions</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span>Real-time earnings dashboard</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span>No minimum payout - earn from the first transaction</span>
                        </li>
                      </ul>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="text-2xl">💰</span> How to Get Started
                      </h3>
                      <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Navigate to the <strong className="text-white">"Referrals"</strong> tab</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Your unique referral link is automatically generated</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Click the <strong className="text-white">copy button</strong> to copy your referral link</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Share your link with friends via social media, Discord, Twitter, or anywhere else</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Track your earnings in real-time on the Referrals page</span>
                        </li>
                      </ul>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763874886453.png', import.meta.url).href}
                            alt="Referral dashboard showing total earnings and referral link" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Your referral stats and link</p>
                        </div>
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763875199940.png', import.meta.url).href}
                            alt="Recent referral transactions showing earnings" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Track your referral earnings</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-3">Pro Tips</h3>
                      <ul className="space-y-2 text-purple-200 list-disc list-inside">
                        <li>Share your referral link in crypto communities, Discord servers, and social media</li>
                        <li>Explain the benefits of GetFreeSol to maximize conversions</li>
                        <li>Your commission is automatically tracked - no manual claiming needed</li>
                        <li>The more your referrals use the platform, the more you earn!</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeDocSection === 'points' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-white text-2xl font-semibold">Points System</h2>
                  <p className="text-purple-200">
                    Earn points for every action you take and compete on the leaderboard!
                  </p>
                </div>
                <div className="space-y-6 text-white prose prose-invert max-w-none">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4">How to Earn Points</h3>
                      <p className="text-purple-200 leading-relaxed mb-4">
                        Points are awarded automatically for every action you take on GetFreeSol. 
                        Compete with other users on the <strong className="text-white">Top 10 Leaderboard</strong> to see who's earning the most!
                      </p>

                      <div className="bg-purple-800/30 border border-purple-600/50 rounded-lg p-5 space-y-3">
                        <h4 className="text-white font-semibold text-base mb-3 flex items-center gap-2"><span>🔒</span> Claiming & Burning</h4>
                        <ul className="space-y-3 text-purple-200 leading-relaxed">
                          <li className="flex items-start gap-3">
                            <span className="text-yellow-400 mt-1">⭐</span>
                            <span><strong className="text-white">20 points</strong> for every empty account closed</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="text-yellow-400 mt-1">⭐</span>
                            <span><strong className="text-white">Points</strong> for burning tokens and NFTs</span>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-5 space-y-3">
                        <h4 className="text-white font-semibold text-base mb-3 flex items-center gap-2"><span>⚡</span> Staking (gSOL)</h4>
                        <ul className="space-y-3 text-purple-200 leading-relaxed">
                          <li className="flex items-start gap-3">
                            <span className="text-green-400 mt-1">⭐</span>
                            <span><strong className="text-white">100 points per 1 SOL staked</strong> every 24 hours</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="text-green-400 mt-1">⭐</span>
                            <span><strong className="text-white">+100 point welcome bonus</strong> for first-time stakers</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="text-yellow-400 mt-1">⭐</span>
                            <span>Hold gSOL for <strong className="text-white">30+ days</strong> to unlock a <strong className="text-yellow-400">1.5× point multiplier</strong></span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="text-purple-400 mt-1">⭐</span>
                            <span>Earn <strong className="text-white">10% of your referrals' daily staking points</strong> automatically</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="text-2xl">🏆</span> Your Stats & Leaderboard
                      </h3>
                      <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Navigate to the <strong className="text-white">"Points"</strong> tab</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>View your <strong className="text-white">Total Points</strong>, <strong className="text-white">SOL Claimed</strong>, and <strong className="text-white">Global Rank</strong></span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Check the <strong className="text-white">Top 10 Leaderboard</strong> to see the highest-ranking users</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1">▸</span>
                          <span>Stake gSOL and close more accounts to climb the leaderboard!</span>
                        </li>
                      </ul>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763875662978.png', import.meta.url).href}
                            alt="Points dashboard showing total points, SOL claimed, and rank" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Your points and ranking</p>
                        </div>
                        <div className="space-y-2">
                          <img 
                            src={new URL('@assets/image_1763875412373.png', import.meta.url).href}
                            alt="Top 10 leaderboard showing highest-ranking users" 
                            className="rounded-lg border border-purple-500/50 w-full"
                          />
                          <p className="text-sm text-purple-300 text-center italic">Top 10 leaderboard</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeDocSection === 'staking' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-white text-2xl font-semibold">Staking (gSOL)</h2>
                  <p className="text-purple-200">
                    Stake your SOL to receive gSOL — Get Staked SOL — and earn yield plus points while you hold.
                  </p>
                </div>
                <div className="space-y-8 text-white prose prose-invert max-w-none">

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                      <span>⚡</span> What is gSOL?
                    </h3>
                    <p className="text-purple-200 leading-relaxed">
                      <strong className="text-white">gSOL (Get Staked SOL)</strong> is a liquid staking token you receive when you stake SOL on GetFreeSol. 
                      It represents your staked SOL plus any yield it earns over time. You can unstake at any time to get your SOL back.
                    </p>
                    <div className="bg-purple-800/30 border border-purple-600/50 rounded-lg p-5 space-y-3">
                      <ul className="space-y-3 text-purple-200 leading-relaxed">
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span>Stake SOL → receive <strong className="text-white">gSOL</strong> 1:1</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span>Your SOL earns <strong className="text-white">staking yield</strong> automatically while held as gSOL</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span>Unstake any time — no lock-up period</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="text-green-400 mt-1">✓</span>
                          <span>Liquid — hold gSOL in your wallet while still earning</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                      <span>🎯</span> How to Stake
                    </h3>
                    <ul className="space-y-3 text-purple-200 leading-relaxed">
                      <li className="flex items-start gap-3">
                        <span className="text-blue-400 font-bold mt-0.5">1.</span>
                        <span>Connect your wallet and go to the <strong className="text-white">Staking</strong> tab</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-blue-400 font-bold mt-0.5">2.</span>
                        <span>Enter the amount of SOL you want to stake</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-blue-400 font-bold mt-0.5">3.</span>
                        <span>Click <strong className="text-white">Stake</strong> and approve the transaction in your wallet</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-blue-400 font-bold mt-0.5">4.</span>
                        <span>You'll receive <strong className="text-white">gSOL</strong> in your wallet immediately</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-blue-400 font-bold mt-0.5">5.</span>
                        <span>To unstake, switch to <strong className="text-white">Unstake</strong> mode and burn your gSOL to get SOL back</span>
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                      <span>⭐</span> Points for Staking
                    </h3>
                    <p className="text-purple-200 leading-relaxed mb-4">
                      Holding gSOL earns you points every single day. The longer you hold, the more you earn.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-green-900/30 border border-green-600/50 rounded-lg p-4 text-center">
                        <p className="text-green-400 text-2xl font-bold">100 pts</p>
                        <p className="text-purple-200 text-sm mt-1">per 1 SOL staked every 24 hours</p>
                      </div>
                      <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-4 text-center">
                        <p className="text-blue-400 text-2xl font-bold">+100 pts</p>
                        <p className="text-purple-200 text-sm mt-1">first-time staker welcome bonus</p>
                      </div>
                      <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 text-center">
                        <p className="text-yellow-400 text-2xl font-bold">1.5×</p>
                        <p className="text-purple-200 text-sm mt-1">point multiplier after holding 30+ days</p>
                      </div>
                      <div className="bg-purple-900/30 border border-purple-600/50 rounded-lg p-4 text-center">
                        <p className="text-purple-400 text-2xl font-bold">10%</p>
                        <p className="text-purple-200 text-sm mt-1">of referrals' daily staking points</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-800/20 border border-purple-600/40 rounded-lg p-5">
                    <p className="text-purple-200 text-sm leading-relaxed">
                      <strong className="text-white">Tip:</strong> After claiming your SOL, click the <strong className="text-white">Stake It</strong> button on the claim card to go straight to the Staking tab and put your recovered SOL to work immediately!
                    </p>
                  </div>

                </div>
              </div>
            )}

            {activeDocSection === 'developer-api' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-white text-2xl font-semibold">Developer API</h2>
                  <p className="text-purple-200">
                    Integrate GetFreeSol into your applications with our Developer API
                  </p>
                </div>
                <div className="space-y-6 text-white prose prose-invert max-w-none">
                  <p className="text-purple-200 leading-relaxed">
                    For full API documentation including endpoints, authentication, and code examples, 
                    visit our dedicated <Link href="/api-docs" className="text-purple-400 hover:text-purple-300 underline">Developer API Documentation</Link> page.
                  </p>
                  <div className="bg-purple-800/30 border border-purple-600/50 rounded-lg p-6 space-y-4">
                    <h3 className="text-xl font-semibold text-white">Quick Overview</h3>
                    <ul className="space-y-3 text-purple-200">
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-1">✓</span>
                        <span>Scan wallets for empty token accounts</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-1">✓</span>
                        <span>Generate close account transactions</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-1">✓</span>
                        <span>Integrate referral tracking</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-1">✓</span>
                        <span>Access platform statistics</span>
                      </li>
                    </ul>
                    <Link href="/api-docs">
                      <button className="mt-4 bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-lg transition-colors">
                        View Full API Documentation
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Pagination - Only visible on mobile */}
            <div className="block lg:hidden mt-12 pt-6 border-t border-purple-700/50 space-y-3">
              {previousSection && (
                <button
                  onClick={() => setActiveDocSection(previousSection.id as any)}
                  className="w-full text-left bg-purple-800/30 hover:bg-purple-700/50 border border-purple-600/50 rounded-lg p-4 transition-colors"
                  data-testid="button-prev-section"
                >
                  <div className="text-xs text-purple-300 mb-1">Previous</div>
                  <div className="text-white font-medium">{previousSection.title}</div>
                </button>
              )}
              {nextSection && (
                <button
                  onClick={() => setActiveDocSection(nextSection.id as any)}
                  className="w-full text-left bg-purple-800/30 hover:bg-purple-700/50 border border-purple-600/50 rounded-lg p-4 transition-colors"
                  data-testid="button-next-section"
                >
                  <div className="text-xs text-purple-300 mb-1">Next</div>
                  <div className="text-white font-medium">{nextSection.title}</div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

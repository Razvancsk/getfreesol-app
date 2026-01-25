import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Copy, X, Share2, Sparkles, Coins, TrendingUp, Zap } from 'lucide-react';
import { Link } from 'wouter';

export default function DesignPreview() {
  const [solAmount, setSolAmount] = useState('0.15234');
  const [accountsClosed, setAccountsClosed] = useState('3');
  const [cardStyle, setCardStyle] = useState<'style1' | 'style2' | 'style3' | 'style4'>('style1');

  const referralLink = 'https://getfreesol.com/?ref=abc123';

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-800 to-purple-900 p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/">
          <Button variant="ghost" className="text-white mb-6 hover:bg-purple-700/50">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to App
          </Button>
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Card Design Preview</h1>
        <p className="text-purple-300 mb-8">Preview and customize how the claim success card looks</p>

        {/* Controls */}
        <div className="bg-purple-800/50 rounded-xl p-6 mb-8 border border-purple-500/30">
          <h2 className="text-xl font-semibold text-white mb-4">Preview Controls</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-purple-300 mb-2 block">SOL Amount</label>
              <Input
                type="text"
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                className="bg-purple-900/50 border-purple-500/30 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-purple-300 mb-2 block">Accounts Closed</label>
              <Input
                type="text"
                value={accountsClosed}
                onChange={(e) => setAccountsClosed(e.target.value)}
                className="bg-purple-900/50 border-purple-500/30 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-purple-300 mb-2 block">Card Style</label>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setCardStyle('style1')}
                  className={cardStyle === 'style1' ? 'bg-purple-600' : 'bg-purple-800/50'}
                  size="sm"
                >
                  Style 1
                </Button>
                <Button 
                  onClick={() => setCardStyle('style2')}
                  className={cardStyle === 'style2' ? 'bg-purple-600' : 'bg-purple-800/50'}
                  size="sm"
                >
                  Style 2
                </Button>
                <Button 
                  onClick={() => setCardStyle('style3')}
                  className={cardStyle === 'style3' ? 'bg-purple-600' : 'bg-purple-800/50'}
                  size="sm"
                >
                  Style 3
                </Button>
                <Button 
                  onClick={() => setCardStyle('style4')}
                  className={cardStyle === 'style4' ? 'bg-purple-600' : 'bg-purple-800/50'}
                  size="sm"
                >
                  Style 4
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Card Previews */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Style 1 - Current Style */}
          {cardStyle === 'style1' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Style 1 - Current</h3>
              <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-2xl p-6 border border-purple-400/30 shadow-2xl max-w-md">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-white">Share</h3>
                  <button className="text-purple-300 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-purple-200 mb-4">Invite friends to earn more $SOL</p>
                
                <div className="text-center py-6">
                  <p className="text-3xl font-bold text-green-400 mb-2">
                    {solAmount} SOL Claimed! 🎉
                  </p>
                </div>

                <div className="flex justify-center mb-4">
                  <button className="bg-black rounded-full p-3 hover:bg-gray-800 transition-colors">
                    <X className="h-5 w-5 text-white" />
                  </button>
                </div>

                <div className="flex gap-2 mb-4">
                  <Input 
                    value={referralLink}
                    readOnly
                    className="bg-purple-900/50 border-purple-400/30 text-purple-200 text-sm"
                  />
                  <Button className="bg-green-500 hover:bg-green-600">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <p className="text-center text-green-400 text-sm font-medium">
                  Earn 50% commission of every SOL your referrals claim!
                </p>
              </div>
            </div>
          )}

          {/* Style 2 - Minimalist */}
          {cardStyle === 'style2' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Style 2 - Minimalist</h3>
              <div className="bg-black/80 backdrop-blur-xl rounded-3xl p-8 border border-purple-500/20 shadow-2xl max-w-md">
                <div className="flex justify-end mb-2">
                  <button className="text-gray-500 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="text-center space-y-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-full">
                    <Sparkles className="h-8 w-8 text-white" />
                  </div>
                  
                  <div>
                    <p className="text-5xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                      {solAmount}
                    </p>
                    <p className="text-xl text-gray-400 mt-1">SOL Claimed</p>
                  </div>

                  <div className="bg-purple-900/30 rounded-xl p-4">
                    <p className="text-sm text-purple-300 mb-2">Share & earn 50% commission</p>
                    <div className="flex gap-2">
                      <Input 
                        value={referralLink}
                        readOnly
                        className="bg-black/50 border-purple-500/20 text-white text-xs"
                      />
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-center gap-4">
                    <button className="bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors">
                      <X className="h-5 w-5 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Style 3 - Glassmorphism */}
          {cardStyle === 'style3' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Style 3 - Glassmorphism</h3>
              <div className="relative max-w-md">
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/30 to-purple-500/30 blur-3xl" />
                <div className="relative bg-white/10 backdrop-blur-2xl rounded-3xl p-8 border border-white/20 shadow-2xl">
                  <div className="flex justify-end">
                    <button className="text-white/50 hover:text-white">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center gap-2">
                      <Coins className="h-8 w-8 text-yellow-400" />
                      <span className="text-lg font-medium text-white/80">Success!</span>
                    </div>
                    
                    <div className="py-4">
                      <p className="text-6xl font-black text-white tracking-tight">
                        {solAmount}
                      </p>
                      <p className="text-xl font-semibold text-green-400 mt-2">SOL Recovered</p>
                      <p className="text-sm text-white/60 mt-1">{accountsClosed} accounts closed</p>
                    </div>

                    <div className="bg-black/20 rounded-2xl p-4 space-y-3">
                      <p className="text-white/80 text-sm font-medium">Share to earn more</p>
                      <div className="flex gap-2">
                        <Input 
                          value={referralLink}
                          readOnly
                          className="bg-white/10 border-white/10 text-white text-sm"
                        />
                        <Button className="bg-green-500 hover:bg-green-600">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-green-400 text-xs">50% referral commission</p>
                    </div>

                    <button className="bg-black rounded-full p-3 hover:bg-black/80 transition-colors">
                      <X className="h-5 w-5 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Style 4 - Bold & Vibrant */}
          {cardStyle === 'style4' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Style 4 - Bold & Vibrant</h3>
              <div className="bg-gradient-to-br from-green-500 via-emerald-600 to-green-700 rounded-3xl p-1 max-w-md shadow-2xl">
                <div className="bg-gray-900 rounded-[22px] p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                      <div className="bg-green-500 rounded-lg p-1.5">
                        <Zap className="h-4 w-4 text-white" />
                      </div>
                      <span className="font-bold text-white">GetFreeSol</span>
                    </div>
                    <button className="text-gray-500 hover:text-white">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  
                  <div className="text-center space-y-4 py-4">
                    <div className="inline-block bg-green-500/20 text-green-400 px-4 py-1 rounded-full text-sm font-medium">
                      ✓ Transaction Confirmed
                    </div>
                    
                    <div>
                      <p className="text-5xl font-black text-white">
                        +{solAmount}
                      </p>
                      <p className="text-green-400 font-semibold text-lg mt-1">SOL CLAIMED</p>
                    </div>

                    <div className="flex justify-center gap-6 text-sm text-gray-400">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-white">{accountsClosed}</p>
                        <p>Accounts</p>
                      </div>
                      <div className="w-px bg-gray-700" />
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-400">50%</p>
                        <p>Commission</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-gray-400 text-sm">Your referral link</span>
                      <Share2 className="h-4 w-4 text-gray-400" />
                    </div>
                    <div className="flex gap-2">
                      <Input 
                        value={referralLink}
                        readOnly
                        className="bg-gray-900 border-gray-700 text-white text-sm"
                      />
                      <Button className="bg-green-500 hover:bg-green-600 px-6">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-center mt-6">
                    <button className="bg-white text-black rounded-full px-6 py-2 font-semibold hover:bg-gray-100 transition-colors flex items-center gap-2">
                      <X className="h-4 w-4" />
                      Share on X
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Usage Notes */}
        <div className="mt-12 bg-purple-800/30 rounded-xl p-6 border border-purple-500/20">
          <h3 className="text-lg font-semibold text-white mb-4">Notes</h3>
          <ul className="text-purple-300 space-y-2 text-sm">
            <li>• Adjust the SOL amount and accounts closed to preview different scenarios</li>
            <li>• Click different style buttons to compare card designs</li>
            <li>• Pick your preferred style and let me know which one to implement</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

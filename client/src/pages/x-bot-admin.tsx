import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Twitter, Clock, TrendingUp, MessageSquare, Shield, Check, X as XIcon, ArrowLeft, Send, Loader2, Image, RefreshCw, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useLocation } from 'wouter';

const PLATFORM_WALLET = 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';

const GM_TEMPLATES = [
  "GM Solana fam! ☀️\n\nReady to reclaim some hidden SOL today?\n\nVisit getfreesol.xyz 💜\n\n#Solana #SOL #DeFi #GM",
  "GM! Rise and grind, Solana family! 🌅\n\nDon't let your SOL stay locked in empty accounts!\n\ngetfreesol.xyz 💎\n\n#Solana #GM #GetFreeSol",
  "GM to everyone building on Solana! ☀️\n\nReclaim your rent deposits from empty token accounts\n\ngetfreesol.xyz\n\n#Solana #DeFi #GM",
  "GM frens! ☀️\n\nDid you know you can recover SOL from empty token accounts?\n\nCheck it out at getfreesol.xyz 🚀\n\n#Solana #GM",
  "GM! ☀️\n\nAnother beautiful day to clean up your wallet\n\ngetfreesol.xyz\n\n#Solana #GM #GetFreeSol",
  "GM Solana! 🌞\n\nStart your day by recovering hidden SOL\n\ngetfreesol.xyz 💜\n\n#Solana #GM",
  "GM! ☀️\n\nYour wallet has hidden treasure waiting\n\nFind it at getfreesol.xyz\n\n#Solana #GM #DeFi",
  "GM builders! 🌅\n\nEmpty accounts = locked SOL\n\nUnlock yours at getfreesol.xyz\n\n#Solana #GM",
  "GM! ☀️\n\nDon't forget to check for claimable SOL today\n\ngetfreesol.xyz\n\n#Solana #GM #GetFreeSol",
  "GM Solana fam! 🌞\n\nWho's claiming some free SOL today?\n\ngetfreesol.xyz 💎\n\n#Solana #GM",
  "GM! ☀️\n\nClean wallet = happy wallet\n\nReclaim at getfreesol.xyz\n\n#Solana #GM #DeFi",
  "GM to all the Solana degens! 🌅\n\nGet your hidden SOL back\n\ngetfreesol.xyz\n\n#Solana #GM",
  "GM! ☀️\n\nFun fact: You probably have SOL stuck in old accounts\n\nCheck getfreesol.xyz\n\n#Solana #GM",
  "GM everyone! 🌞\n\nNew day, new SOL to reclaim\n\ngetfreesol.xyz 💜\n\n#Solana #GM #GetFreeSol",
  "GM! ☀️\n\nCoffee + reclaiming SOL = perfect morning\n\ngetfreesol.xyz\n\n#Solana #GM",
  "GM Solana! 🌅\n\nHave you scanned your wallet lately?\n\ngetfreesol.xyz\n\n#Solana #GM #DeFi",
  "GM frens! ☀️\n\nYour empty token accounts are waiting\n\ngetfreesol.xyz 💎\n\n#Solana #GM",
  "GM! 🌞\n\nLet's make today a SOL reclaim day\n\ngetfreesol.xyz\n\n#Solana #GM #GetFreeSol",
  "GM to the best community! ☀️\n\nReclaim your rent deposits today\n\ngetfreesol.xyz 💜\n\n#Solana #GM",
  "GM! 🌅\n\nEvery empty account = ~0.002 SOL waiting for you\n\ngetfreesol.xyz\n\n#Solana #GM",
];

const GN_TEMPLATES = [
  "GN Solana fam! 🌙\n\nSleep well knowing your SOL is safe!\n\ngetfreesol.xyz 💜\n\n#Solana #GN #GetFreeSol",
  "GN! Another great day in Solana 🌙\n\nTomorrow, reclaim more hidden SOL!\n\ngetfreesol.xyz ✨\n\n#Solana #GN",
];

const TRENDING_TEMPLATES = [
  "🔥 #2 ON PHANTOM WALLET 🔥\n\nGet Free Sol is trending on @phantom!\n\nThank you Solana fam 💜\n\ngetfreesol.xyz\n\n#Solana #Phantom #GetFreeSol",
  "We're trending #2 on @phantom! 🚀\n\nThe SOL reclaim movement is real 💜\n\ngetfreesol.xyz\n\n#Solana #Phantom",
  "no way... we're #2 on phantom 🤯\n\nyou guys are insane. thank you 💜\n\ngetfreesol.xyz\n\n#Solana #GetFreeSol",
  "🏆 #2 TRENDING ON PHANTOM 🏆\n\nReclaim your hidden SOL today 💜\n\ngetfreesol.xyz\n\n#Solana #Phantom",
];

const TRENDING1_TEMPLATES = [
  "🥇 #1 ON PHANTOM WALLET 🥇\n\nGet Free Sol is now the top tool on @phantom!\n\nThank you Solana fam 💜\n\ngetfreesol.xyz\n\n#Solana #Phantom #GetFreeSol",
  "WE DID IT! #1 on @phantom! 🏆\n\nThe SOL reclaim movement is unstoppable 💜\n\ngetfreesol.xyz\n\n#Solana #Phantom",
  "no way... we're #1 on phantom 🤯\n\nyou guys are absolutely insane. THANK YOU 💜\n\ngetfreesol.xyz\n\n#Solana #GetFreeSol",
  "🥇 NUMBER ONE ON PHANTOM 🥇\n\nReclaim your hidden SOL at getfreesol.xyz 💜\n\n#Solana #Phantom #GetFreeSol",
];

const FUNNY_TEMPLATES = [
  "ser you got rent deposits just sitting there doing nothing 💀\n\nclose those empty accounts\n\ngetfreesol.xyz\n\n#Solana",
  "POV: you realize you got 0.5 SOL locked in rent from old tokens 🧠\n\ntime to reclaim\n\ngetfreesol.xyz\n\n#Solana",
  "ngmi if you still got rent locked in 200 empty accounts 🪦\n\nclose em stack SOL\n\ngetfreesol.xyz\n\n#Solana",
  "that wojak moment when you find hidden SOL rent in your wallet 💎\n\nwagmi\n\ngetfreesol.xyz\n\n#Solana",
  "degens be like: im broke\n\nalso degens: 500 empty accounts with rent deposits 🤡\n\ngetfreesol.xyz\n\n#Solana",
  "imagine not reclaiming your rent in 2024 💀\n\nfree SOL is free SOL\n\ngetfreesol.xyz\n\n#Solana",
  "every empty token account = 0.002 SOL rent locked 🔐\n\ntime to unlock it\n\ngetfreesol.xyz\n\n#Solana",
  "virgin: leaving rent in empty accounts\nchad: closing accounts and stacking SOL 💪\n\ngetfreesol.xyz\n\n#Solana",
  "touch grass? nah fam\n\ntouch your rent deposits 🌿\n\ngetfreesol.xyz\n\n#Solana",
  "your rent deposits from 2022 are still waiting 💀\n\ncome get your SOL back\n\ngetfreesol.xyz\n\n#Solana",
  "giga brain move: close empty accounts, reclaim the rent 🧠\n\nits not complicated\n\ngetfreesol.xyz\n\n#Solana",
  "that rent deposit hits different when SOL pumps 🔥\n\nreclaim SZN\n\ngetfreesol.xyz\n\n#Solana",
  "i didnt hear no bell 🔔\n\n*closes 50 empty accounts for rent*\n\ngetfreesol.xyz\n\n#Solana",
  "least desperate degen:\n\n*reclaims 0.002 SOL rent from 2019 airdrop account*\n\nworthit.jpg\n\ngetfreesol.xyz\n\n#Solana",
  "ser pls\n\nyour wallet has hidden rent waiting for you\n\ngetfreesol.xyz\n\n#Solana",
  "wen lambo? after you reclaim that rent fren 🚗\n\ngetfreesol.xyz\n\n#Solana",
  "the virgin hodler vs the chad rent reclaimer 🔥\n\nbe the chad\n\ngetfreesol.xyz\n\n#Solana",
  "anon discovers free SOL was inside him all along 💀\n\n(in empty account rent deposits)\n\ngetfreesol.xyz\n\n#Solana",
  "solana charges rent for every token account you create 💰\n\nclose the empty ones get it back\n\ngetfreesol.xyz\n\n#Solana",
  "you: wondering where your SOL went\n\nyour empty accounts: holding your rent hostage 👀\n\ngetfreesol.xyz\n\n#Solana",
];

function QuickPostCard({ botStatus, toast }: { botStatus: any; toast: any }) {
  const [postContent, setPostContent] = useState('');
  const [includeImage, setIncludeImage] = useState(true);
  const [imageType, setImageType] = useState<'promo' | 'gm' | 'gn' | 'stats' | 'funny' | 'ai_meme' | 'trending' | 'trending1'>('promo');
  const [imageKey, setImageKey] = useState(Date.now());
  const [aiMemePreview, setAiMemePreview] = useState<string | null>(null);
  const [isGeneratingAiMeme, setIsGeneratingAiMeme] = useState(false);

  const postMutation = useMutation({
    mutationFn: async ({ content, withImage, imgType }: { content: string; withImage: boolean; imgType: string }) => {
      if (imgType === 'ai_meme') {
        const response = await apiRequest('POST', '/api/x-bot/post-ai-meme', { content });
        return response.json();
      }
      const response = await apiRequest('POST', '/api/x-bot/quick-post', { 
        content, 
        includeImage: withImage,
        imageType: imgType 
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Posted Successfully! 🎉',
        description: `Tweet ID: ${data.tweetId}`,
      });
      setPostContent('');
      setImageKey(Date.now());
      queryClient.invalidateQueries({ queryKey: ['/api/x-bot/status'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Post Failed',
        description: error.message || 'Failed to post tweet',
        variant: 'destructive',
      });
    },
  });

  const handleQuickPost = (template: string, imgType: 'promo' | 'gm' | 'gn' | 'stats' | 'funny' | 'ai_meme' | 'trending' | 'trending1') => {
    setPostContent(template);
    setImageType(imgType);
    setAiMemePreview(null);
    setImageKey(Date.now());
  };

  const generateAiMeme = async () => {
    setIsGeneratingAiMeme(true);
    setAiMemePreview(null);
    try {
      const response = await fetch('/api/x-bot/generate-ai-meme', { method: 'POST' });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setAiMemePreview(url);
        setImageType('ai_meme');
        setIncludeImage(true);
        const randomText = FUNNY_TEMPLATES[Math.floor(Math.random() * FUNNY_TEMPLATES.length)];
        setPostContent(randomText);
        toast({
          title: 'AI Meme Generated!',
          description: 'New image + text ready! Click refresh for another one.',
        });
      } else {
        throw new Error('Failed to generate AI meme');
      }
    } catch (error: any) {
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate AI meme',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingAiMeme(false);
    }
  };

  const handlePost = async () => {
    if (!postContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter some content to post',
        variant: 'destructive',
      });
      return;
    }
    postMutation.mutate({ content: postContent, withImage: includeImage, imgType: imageType });
  };

  const refreshImage = () => {
    if (imageType === 'ai_meme') {
      generateAiMeme();
    } else {
      setImageKey(Date.now());
    }
  };

  if (!botStatus?.isAuthenticated) {
    return (
      <Card className="bg-purple-800/50 border-purple-600">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Send className="h-5 w-5" />
            Quick Post
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="bg-yellow-900/30 border-yellow-600">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-200">
              Connect your X account first to post content
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-purple-800/50 border-purple-600">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Send className="h-5 w-5" />
          Quick Post
        </CardTitle>
        <CardDescription className="text-purple-200">
          Post content to X immediately with auto-generated images
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Templates */}
        <div className="space-y-2">
          <Label className="text-purple-200">Quick Templates</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickPost(GM_TEMPLATES[Math.floor(Math.random() * GM_TEMPLATES.length)], 'gm')}
              className="border-purple-500 text-purple-200 hover:bg-purple-700"
            >
              ☀️ GM Post
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickPost(GN_TEMPLATES[Math.floor(Math.random() * GN_TEMPLATES.length)], 'gn')}
              className="border-purple-500 text-purple-200 hover:bg-purple-700"
            >
              🌙 GN Post
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickPost("🔥 Reclaim your hidden SOL today!\n\nEmpty token accounts are holding your rent deposits.\n\nVisit getfreesol.xyz to recover them!\n\n#Solana #DeFi #GetFreeSol", 'promo')}
              className="border-purple-500 text-purple-200 hover:bg-purple-700"
            >
              🔥 Promo Post
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickPost("📊 Platform Stats Update!\n\nCheck out how much SOL our community has reclaimed!\n\nJoin us: getfreesol.xyz\n\n#Solana #DeFi #GetFreeSol", 'stats')}
              className="border-purple-500 text-purple-200 hover:bg-purple-700"
            >
              📊 Stats Post
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickPost(FUNNY_TEMPLATES[Math.floor(Math.random() * FUNNY_TEMPLATES.length)], 'funny')}
              className="border-orange-500 text-orange-200 hover:bg-orange-700"
            >
              😂 Funny Post
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickPost(TRENDING_TEMPLATES[Math.floor(Math.random() * TRENDING_TEMPLATES.length)], 'trending')}
              className="border-green-500 text-green-200 hover:bg-green-700"
            >
              🚀 Trending #2
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickPost(TRENDING1_TEMPLATES[Math.floor(Math.random() * TRENDING1_TEMPLATES.length)], 'trending1')}
              className="border-yellow-500 text-yellow-200 hover:bg-yellow-700"
            >
              🥇 Trending #1
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPostContent(FUNNY_TEMPLATES[Math.floor(Math.random() * FUNNY_TEMPLATES.length)]);
                generateAiMeme();
              }}
              disabled={isGeneratingAiMeme}
              className="border-pink-500 text-pink-200 hover:bg-pink-700"
            >
              {isGeneratingAiMeme ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" /> AI Meme</>
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Post Content */}
          <div className="space-y-2 flex-1">
            <Label className="text-purple-200">Post Content</Label>
            <Textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder="Write your post here..."
              className="bg-purple-900/50 border-purple-600 text-white placeholder-purple-400 min-h-[180px]"
              maxLength={280}
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-purple-400">{postContent.length}/280 characters</span>
            </div>
          </div>

          {/* Image Preview */}
          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <Label className="text-purple-200 flex items-center gap-2">
                <Image className="h-4 w-4" />
                Image Preview
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshImage}
                  className="text-purple-300 hover:text-white hover:bg-purple-700 h-8 w-8 p-0"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <label className="flex items-center gap-2 text-sm text-purple-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeImage}
                    onChange={(e) => setIncludeImage(e.target.checked)}
                    className="rounded border-purple-500 bg-purple-900/50"
                  />
                  Include
                </label>
              </div>
            </div>
            <div className={`relative rounded-lg border border-purple-600 bg-purple-900/30 p-2 ${!includeImage ? 'opacity-50' : ''}`}>
              {imageType === 'ai_meme' && aiMemePreview ? (
                <img
                  src={aiMemePreview}
                  alt="AI generated meme preview"
                  className="w-full h-auto rounded"
                  style={{ maxWidth: '100%', display: 'block' }}
                />
              ) : imageType === 'ai_meme' && isGeneratingAiMeme ? (
                <div className="w-full aspect-square flex items-center justify-center bg-purple-900/50 rounded">
                  <div className="text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-pink-400 mx-auto mb-2" />
                    <p className="text-pink-300">Generating AI meme...</p>
                  </div>
                </div>
              ) : (
                <img
                  key={imageKey}
                  src={`/api/x/generate-card?type=${imageType}&t=${imageKey}`}
                  alt="Post image preview"
                  className="w-full h-auto rounded"
                  style={{ maxWidth: '100%', display: 'block' }}
                  onError={(e) => {
                    console.error('Image failed to load for type:', imageType);
                    (e.target as HTMLImageElement).src = `/api/x/generate-card?type=promo&t=${Date.now()}`;
                  }}
                />
              )}
              {imageType === 'ai_meme' && (
                <div className="absolute top-4 right-4">
                  <Badge className="bg-pink-500/80">
                    <Sparkles className="h-3 w-3 mr-1" /> AI Generated
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Post Button */}
        <div className="flex justify-end">
          <Button
            onClick={handlePost}
            disabled={postMutation.isPending || !postContent.trim()}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6"
          >
            {postMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Posting...
              </>
            ) : (
              <>
                <Twitter className="h-4 w-4 mr-2" />
                Post to X {includeImage && '(with image)'}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function XBotAdmin() {
  const { publicKey, connected } = useWallet();
  const [isPlatformWallet, setIsPlatformWallet] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Fetch X bot status
  const { data: botStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/x-bot/status'],
    enabled: isPlatformWallet,
  });

  useEffect(() => {
    if (publicKey) {
      setIsPlatformWallet(publicKey.toBase58() === PLATFORM_WALLET);
    } else {
      setIsPlatformWallet(false);
    }
    
    // Check for OAuth callback status
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      toast({
        title: 'Success!',
        description: 'Your X account has been connected successfully',
      });
      // Clean up URL
      window.history.replaceState({}, '', '/admin/x-bot');
    } else if (params.get('error') === 'oauth_failed') {
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect your X account. Please try again.',
        variant: 'destructive',
      });
      // Clean up URL
      window.history.replaceState({}, '', '/admin/x-bot');
    }
  }, [publicKey, toast]);
  
  // Handle OAuth connection
  const handleConnectXAccount = () => {
    // Simply redirect to OAuth endpoint - it will redirect to X for authorization
    window.location.href = '/api/x-bot/oauth/request-token';
  };

  // Access denied screen
  if (!connected || !isPlatformWallet) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-800 to-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-purple-800/50 border-purple-600 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-6 w-6 text-purple-400" />
              <CardTitle className="text-2xl text-white">Access Denied</CardTitle>
            </div>
            <CardDescription className="text-purple-200">
              This page is restricted to the platform wallet only
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-purple-900/50 border-purple-600">
              <AlertCircle className="h-4 w-4 text-purple-400" />
              <AlertDescription className="text-purple-200">
                {!connected 
                  ? 'Please connect your wallet to access this page'
                  : 'Your wallet does not have permission to access the X Bot admin panel'
                }
              </AlertDescription>
            </Alert>
            
            {connected && publicKey && (
              <div className="p-3 bg-purple-900/30 rounded border border-purple-700">
                <p className="text-xs text-purple-300 mb-1">Your Wallet:</p>
                <p className="text-xs text-white font-mono break-all">{publicKey.toBase58()}</p>
              </div>
            )}
            
            <div className="p-3 bg-purple-900/30 rounded border border-purple-700">
              <p className="text-xs text-purple-300 mb-1">Required Wallet:</p>
              <p className="text-xs text-white font-mono break-all">{PLATFORM_WALLET}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin dashboard
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-800 to-black p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setLocation('/')}
                  variant="ghost"
                  size="icon"
                  className="text-purple-300 hover:text-white hover:bg-purple-700"
                  data-testid="button-back-home"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="p-2 bg-blue-500 rounded-lg">
                  <Twitter className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl text-white">X Bot Admin Dashboard</CardTitle>
                  <CardDescription className="text-purple-200">
                    Manage automated posting and engagement for Get Your SOL Back!
                  </CardDescription>
                </div>
              </div>
              <Badge className="bg-green-500 text-white">Platform Wallet Connected</Badge>
            </div>
          </CardHeader>
        </Card>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-purple-800/50 border border-purple-600">
            <TabsTrigger value="overview" className="data-[state=active]:bg-purple-600">
              <TrendingUp className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="auth" className="data-[state=active]:bg-purple-600">
              <Shield className="h-4 w-4 mr-2" />
              X Authentication
            </TabsTrigger>
            <TabsTrigger value="schedules" className="data-[state=active]:bg-purple-600">
              <Clock className="h-4 w-4 mr-2" />
              Schedules
            </TabsTrigger>
            <TabsTrigger value="engagement" className="data-[state=active]:bg-purple-600">
              <MessageSquare className="h-4 w-4 mr-2" />
              Engagement
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-purple-800/50 border-purple-600">
                <CardHeader>
                  <CardTitle className="text-sm text-purple-200">Posts This Month</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-white">{botStatus?.postsThisMonth || 0}</p>
                  <p className="text-xs text-purple-300 mt-1">{botStatus?.postsThisMonth || 0} / {botStatus?.monthlyLimit || 1500} limit</p>
                </CardContent>
              </Card>
              
              <Card className="bg-purple-800/50 border-purple-600">
                <CardHeader>
                  <CardTitle className="text-sm text-purple-200">Total Engagement</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-white">{botStatus?.totalEngagement || 0}</p>
                  <p className="text-xs text-purple-300 mt-1">Likes + Retweets + Replies</p>
                </CardContent>
              </Card>
              
              <Card className="bg-purple-800/50 border-purple-600">
                <CardHeader>
                  <CardTitle className="text-sm text-purple-200">Bot Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {botStatus?.isAuthenticated ? (
                    <>
                      <Badge className="bg-green-500 text-white">Active</Badge>
                      <p className="text-xs text-purple-300 mt-2">Connected as @{botStatus?.accountName}</p>
                    </>
                  ) : (
                    <>
                      <Badge className="bg-yellow-500 text-white">Not Configured</Badge>
                      <p className="text-xs text-purple-300 mt-2">Connect X account to activate</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="bg-purple-800/50 border-purple-600">
              <CardHeader>
                <CardTitle className="text-white">Setup Instructions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-purple-200">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm">1</div>
                  <div>
                    <p className="font-semibold text-white">Create X Developer Account</p>
                    <p className="text-sm">Visit developer.x.com and create a project to get API keys</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm">2</div>
                  <div>
                    <p className="font-semibold text-white">Configure Authentication</p>
                    <p className="text-sm">Go to the X Authentication tab and connect your account</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm">3</div>
                  <div>
                    <p className="font-semibold text-white">Set Up Posting Schedules</p>
                    <p className="text-sm">Configure GM/GN posts, daily reports, and promotional content</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm">4</div>
                  <div>
                    <p className="font-semibold text-white">Enable Engagement Bot</p>
                    <p className="text-sm">Activate automated engagement with Solana community content</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="auth" className="space-y-4">
            <Card className="bg-purple-800/50 border-purple-600">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">Connect Your X Account</CardTitle>
                    <CardDescription className="text-purple-200">
                      Authorize the app to post on your X account
                    </CardDescription>
                  </div>
                  {botStatus?.isConnected && (
                    <Badge className="bg-green-500 text-white">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {botStatus?.isConnected ? (
                  <Alert className="bg-green-900/30 border-green-600">
                    <Check className="h-4 w-4 text-green-400" />
                    <AlertDescription className="text-green-200">
                      Connected as <strong>{botStatus.accountName}</strong>. The bot can now post on your behalf!
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Alert className="bg-blue-900/30 border-blue-600">
                      <AlertCircle className="h-4 w-4 text-blue-400" />
                      <AlertDescription className="text-blue-200">
                        Click the button below to connect your X (Twitter) account. You'll be redirected to X to authorize the app.
                      </AlertDescription>
                    </Alert>
                    
                    <div className="text-center py-4">
                      <Button 
                        onClick={handleConnectXAccount}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                        data-testid="button-connect-x"
                      >
                        <Twitter className="h-4 w-4 mr-2" />
                        Connect X Account
                      </Button>
                      <p className="text-sm text-purple-300 mt-3">
                        You'll authorize once and the bot can post automatically
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedules" className="space-y-4">
            {/* Quick Post Section */}
            <QuickPostCard botStatus={botStatus} toast={toast} />
            
            <Card className="bg-purple-800/50 border-purple-600">
              <CardHeader>
                <CardTitle className="text-white">Posting Schedules</CardTitle>
                <CardDescription className="text-purple-200">
                  Configure automated posting times and content types
                </CardDescription>
              </CardHeader>
              <CardContent>
                {botStatus?.isAuthenticated ? (
                  <div className="space-y-4">
                    <p className="text-purple-200 text-center py-4">
                      Scheduled posting is available. Configure your GM/GN posts below.
                    </p>
                  </div>
                ) : (
                  <p className="text-purple-200 text-center py-8">
                    Connect your X account first to configure posting schedules
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="engagement">
            <Card className="bg-purple-800/50 border-purple-600">
              <CardHeader>
                <CardTitle className="text-white">Engagement Settings</CardTitle>
                <CardDescription className="text-purple-200">
                  Configure automated engagement with Solana community
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-purple-200 text-center py-8">
                  Engagement bot will be available after connecting your X account
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

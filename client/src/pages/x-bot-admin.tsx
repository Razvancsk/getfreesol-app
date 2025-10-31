import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Twitter, Clock, TrendingUp, MessageSquare, Shield } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import bs58 from 'bs58';

const PLATFORM_WALLET = 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';

export default function XBotAdmin() {
  const { publicKey, connected, signMessage } = useWallet();
  const [isPlatformWallet, setIsPlatformWallet] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

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
                  <p className="text-3xl font-bold text-white">0</p>
                  <p className="text-xs text-purple-300 mt-1">0 / 1,500 limit</p>
                </CardContent>
              </Card>
              
              <Card className="bg-purple-800/50 border-purple-600">
                <CardHeader>
                  <CardTitle className="text-sm text-purple-200">Total Engagement</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-white">0</p>
                  <p className="text-xs text-purple-300 mt-1">Likes + Retweets + Replies</p>
                </CardContent>
              </Card>
              
              <Card className="bg-purple-800/50 border-purple-600">
                <CardHeader>
                  <CardTitle className="text-sm text-purple-200">Bot Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge className="bg-yellow-500 text-white">Not Configured</Badge>
                  <p className="text-xs text-purple-300 mt-2">Connect X account to activate</p>
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

          <TabsContent value="auth">
            <Card className="bg-purple-800/50 border-purple-600">
              <CardHeader>
                <CardTitle className="text-white">X (Twitter) Authentication</CardTitle>
                <CardDescription className="text-purple-200">
                  Connect your X account to enable automated posting
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="bg-blue-900/30 border-blue-600">
                  <AlertCircle className="h-4 w-4 text-blue-400" />
                  <AlertDescription className="text-blue-200">
                    You'll need API Key, API Secret, Access Token, and Access Token Secret from your X Developer account
                  </AlertDescription>
                </Alert>
                
                <div className="text-center py-8">
                  <Button 
                    onClick={handleConnectXAccount}
                    disabled={isConnecting}
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                    data-testid="button-connect-x"
                  >
                    <Twitter className="h-4 w-4 mr-2" />
                    {isConnecting ? 'Connecting...' : 'Connect X Account'}
                  </Button>
                  <p className="text-sm text-purple-300 mt-3">
                    Click to authorize your X account via OAuth
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedules">
            <Card className="bg-purple-800/50 border-purple-600">
              <CardHeader>
                <CardTitle className="text-white">Posting Schedules</CardTitle>
                <CardDescription className="text-purple-200">
                  Configure automated posting times and content types
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-purple-200 text-center py-8">
                  Schedule configuration will be available after connecting your X account
                </p>
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

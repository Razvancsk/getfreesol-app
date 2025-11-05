import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Twitter, CheckCircle2, XCircle, Loader2, ExternalLink, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useLocation, Link } from "wouter";

interface XConnectionStatus {
  connected: boolean;
  accountName?: string;
  accountId?: string;
}

export default function XAdmin() {
  const { toast } = useToast();
  const [showPinInput, setShowPinInput] = useState(false);
  const [oauthToken, setOauthToken] = useState('');
  const [pin, setPin] = useState('');
  const [authUrl, setAuthUrl] = useState('');

  const { data: status, isLoading } = useQuery<XConnectionStatus>({
    queryKey: ['/api/x/oauth/status'],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/x/oauth/request', {});
      return await response.json() as { authUrl: string; oauthToken: string };
    },
    onSuccess: (data) => {
      console.log('OAuth data received:', data);
      setOauthToken(data.oauthToken);
      setAuthUrl(data.authUrl);
      setShowPinInput(true);
      
      const popup = window.open(data.authUrl, 'x-oauth', 'width=600,height=700,popup=1');
      
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        toast({
          title: "Popup Blocked",
          description: "Use the manual link below to authorize",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Authorization Page Opened",
          description: "Please authorize the app on X and copy the PIN code",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to initiate OAuth flow",
        variant: "destructive",
      });
    },
  });

  const verifyPinMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/x/oauth/verify-pin', {
        oauthToken,
        pin,
      });
      return await response.json() as { accountName: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/x/oauth/status'] });
      setShowPinInput(false);
      setPin('');
      setOauthToken('');
      setAuthUrl('');
      toast({
        title: "Success!",
        description: `Connected as @${data.accountName}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Failed to verify PIN",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/x/oauth/disconnect', {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/x/oauth/status'] });
      toast({
        title: "Disconnected",
        description: "Your X account has been disconnected successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Disconnect Failed",
        description: error.message || "Failed to disconnect X account",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 dark:from-background dark:to-secondary/10">
      <div className="container max-w-4xl mx-auto px-4 py-16">
        <Link href="/">
          <Button
            variant="ghost"
            className="mb-6 -ml-2"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
        
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
            X (Twitter) Admin
          </h1>
          <p className="text-muted-foreground">
            Connect your X account to enable automatic posting when users claim SOL
          </p>
        </div>

        <Card className="border-2 border-border/50 dark:border-border/30 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Twitter className="h-6 w-6 text-blue-500" />
              X Account Connection
            </CardTitle>
            <CardDescription>
              Connect your X account to automatically post claim alerts for SOL claims ≥ 0.01 SOL
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8" data-testid="status-loading">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : status?.connected ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-green-500/10 dark:bg-green-500/20 border border-green-500/30 rounded-lg" data-testid="status-connected">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-green-900 dark:text-green-100">
                      Connected
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300 truncate" data-testid="text-account-name">
                      @{status.accountName}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Automatic Posting
                  </h3>
                  <div className="bg-secondary/30 dark:bg-secondary/20 p-4 rounded-lg space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm">
                        Posts are automatically sent when users claim <strong>0.01 SOL or more</strong>
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm">
                        Includes hashtags: #GetFreeSol #ClaimSOL #Solana #DeFi #sol
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm">
                        Shows the claim amount and claimer's wallet address
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <Button
                    variant="destructive"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-disconnect"
                    className="w-full sm:w-auto"
                  >
                    {disconnectMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      'Disconnect X Account'
                    )}
                  </Button>
                </div>
              </div>
            ) : showPinInput ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/30 rounded-lg" data-testid="status-awaiting-pin">
                  <ExternalLink className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      Awaiting PIN
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      A popup window has been opened. Authorize the app and copy the PIN.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {authUrl && (
                    <div className="p-3 bg-secondary/50 dark:bg-secondary/30 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">
                        If the popup didn't open, click here:
                      </p>
                      <a
                        href={authUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                        data-testid="link-manual-auth"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open X Authorization Page
                      </a>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="pin" className="text-sm font-medium">
                      Enter PIN from X
                    </Label>
                    <Input
                      id="pin"
                      type="text"
                      placeholder="1234567"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      disabled={verifyPinMutation.isPending}
                      data-testid="input-pin"
                      className="font-mono text-lg tracking-wider"
                      maxLength={10}
                    />
                    <p className="text-xs text-muted-foreground">
                      After authorizing on X, you'll see a 7-digit PIN. Copy and paste it here.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => verifyPinMutation.mutate()}
                      disabled={verifyPinMutation.isPending || !pin.trim()}
                      data-testid="button-verify-pin"
                      className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                    >
                      {verifyPinMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        'Verify PIN'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowPinInput(false);
                        setPin('');
                        setOauthToken('');
                        setAuthUrl('');
                      }}
                      disabled={verifyPinMutation.isPending}
                      data-testid="button-cancel-pin"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/30 rounded-lg" data-testid="status-disconnected">
                  <XCircle className="h-6 w-6 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-orange-900 dark:text-orange-100">
                      Not Connected
                    </p>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      Connect your X account to enable automatic posting
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    How It Works
                  </h3>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <span className="font-semibold text-foreground">1.</span>
                      Click "Connect X Account" below
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-foreground">2.</span>
                      Authorize the app on X's website (opens in popup)
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-foreground">3.</span>
                      Copy the PIN code shown on X
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-foreground">4.</span>
                      Paste the PIN here to complete connection
                    </li>
                  </ol>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <Button
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    data-testid="button-connect"
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    {connectMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Twitter className="mr-2 h-4 w-4" />
                        Connect X Account
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 p-4 bg-secondary/30 dark:bg-secondary/20 rounded-lg">
          <h3 className="font-semibold text-sm mb-2">Example Post</h3>
          <div className="bg-background p-4 rounded border border-border/50 font-mono text-sm">
            <p>🔥 Hot drop! 1.0975 SOL just got claimed. #GetFreeSol #ClaimSOL #Solana #DeFi #sol</p>
            <p className="mt-2 text-muted-foreground">Claimer: qJJkZxfc...7BotCwz6</p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Twitter, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

interface XConnectionStatus {
  connected: boolean;
  accountName?: string;
  accountId?: string;
}

export default function XAdmin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: status, isLoading } = useQuery<XConnectionStatus>({
    queryKey: ['/api/x/oauth/status'],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest<{ authUrl: string }>('/api/x/oauth/request', {
        method: 'POST',
      });
      return response;
    },
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to initiate OAuth flow",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/x/oauth/disconnect', {
        method: 'POST',
      });
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success) {
      toast({
        title: "Success!",
        description: "Your X account has been connected successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/x/oauth/status'] });
      setLocation('/x-admin');
    }

    if (error) {
      toast({
        title: "Connection Failed",
        description: decodeURIComponent(error),
        variant: "destructive",
      });
      setLocation('/x-admin');
    }
  }, [toast, setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 dark:from-background dark:to-secondary/10">
      <div className="container max-w-4xl mx-auto px-4 py-16">
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
                        Includes hashtags: #UnclaimedSOL #ClaimSOL #Solana #DeFi #sol
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
                      Authorize the app on X's website
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-foreground">3.</span>
                      You'll be redirected back here automatically
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-foreground">4.</span>
                      Automatic posting will be enabled immediately
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
            <p>🔥 Hot drop! 1.0975 SOL just got claimed. #UnclaimedSOL #ClaimSOL #Solana #DeFi #sol</p>
            <p className="mt-2 text-muted-foreground">Claimer: qJJkZxfc...7BotCwz6</p>
          </div>
        </div>
      </div>
    </div>
  );
}

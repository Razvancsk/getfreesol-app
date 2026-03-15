import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, Shield, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import bs58 from 'bs58';

export default function AdminMigrate() {
  const { publicKey, signMessage } = useWallet();
  const { toast } = useToast();
  
  const walletAddress = publicKey?.toBase58();
  const PLATFORM_ADMIN = '6ZCV6FWis2qxeBWEenCZhf1Ccsxokk9pKzak25zhaHvy';
  const isAdmin = walletAddress === PLATFORM_ADMIN;

  const migrateMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signMessage) {
        throw new Error("Wallet not connected");
      }

      const message = `Migrate referral accounts to platform-managed wallets - ${Date.now()}`;
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);

      return await apiRequest('POST', '/api/referral/admin/migrate-accounts', {
        adminWallet: publicKey.toBase58(),
        signature: bs58.encode(signature),
        message,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Migration Complete! ✅",
        description: `Successfully migrated ${data.migrated} out of ${data.total} accounts.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Migration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button
              variant="ghost"
              size="icon"
              className="text-purple-300 hover:text-white hover:bg-purple-700/50"
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <Shield className="h-8 w-8 text-purple-400" />
              Admin Migration
            </h1>
            <p className="text-purple-200">Migrate referral accounts to platform-managed wallets</p>
          </div>
        </div>

        {!publicKey ? (
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">Connect Wallet</CardTitle>
              <CardDescription className="text-purple-200">
                Connect your admin wallet to proceed
              </CardDescription>
            </CardHeader>
            <CardContent className="text-purple-100">
              <p>Please connect your wallet using the button in the top right corner.</p>
            </CardContent>
          </Card>
        ) : !isAdmin ? (
          <Card className="bg-red-900/50 border-red-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">Unauthorized</CardTitle>
              <CardDescription className="text-red-200">
                This page is only accessible to the platform admin
              </CardDescription>
            </CardHeader>
            <CardContent className="text-red-100">
              <p>Connected wallet: {walletAddress}</p>
              <p className="mt-2">Required admin wallet: {PLATFORM_ADMIN}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Account Migration</CardTitle>
                <CardDescription className="text-purple-200">
                  Update existing referral accounts to use platform-managed wallets with encrypted keypairs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-100 font-semibold mb-2">⚠️ Important Information</p>
                  <ul className="text-xs text-yellow-200 space-y-1 list-disc list-inside">
                    <li>This will generate new wallet addresses for existing accounts</li>
                    <li>Old wallet addresses will be replaced with new platform-managed wallets</li>
                    <li>Private keys will be encrypted and stored securely</li>
                    <li>Existing balances on old addresses will NOT be automatically transferred</li>
                  </ul>
                </div>

                <Button
                  onClick={() => migrateMutation.mutate()}
                  disabled={migrateMutation.isPending}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  data-testid="button-migrate-accounts"
                >
                  {migrateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Migrating Accounts...
                    </>
                  ) : (
                    'Migrate All Accounts'
                  )}
                </Button>

                {migrateMutation.data && (
                  <div className="bg-green-500/10 border border-green-400/30 rounded-lg p-4 mt-4">
                    <p className="text-sm text-green-100 font-semibold mb-2">✅ Migration Results</p>
                    <div className="text-xs text-green-200 space-y-1">
                      <p>Migrated: {migrateMutation.data.migrated}</p>
                      <p>Total: {migrateMutation.data.total}</p>
                      {migrateMutation.data.results && (
                        <div className="mt-2 max-h-40 overflow-y-auto">
                          {migrateMutation.data.results.map((result: any, idx: number) => (
                            <div key={idx} className="text-xs py-1 border-t border-green-400/20">
                              <p className="font-semibold">{result.projectName || 'Unknown'}</p>
                              {result.error ? (
                                <p className="text-red-300">Error: {result.error}</p>
                              ) : (
                                <>
                                  <p className="text-green-300">Old: {result.oldAddress?.substring(0, 16)}...</p>
                                  <p className="text-green-300">New: {result.newAddress?.substring(0, 16)}...</p>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

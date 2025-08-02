import { useState } from 'react';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, Wallet, Eye, EyeOff } from 'lucide-react';
import { Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

export function WalletDebugger() {
  const [showDetails, setShowDetails] = useState(false);
  const [testResults, setTestResults] = useState<{
    signTransaction?: boolean;
    signAllTransactions?: boolean;
    error?: string;
  }>({});
  const [testing, setTesting] = useState(false);

  const {
    publicKey,
    connected,
    connecting,
    walletName,
    connection,
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
    isMagicEdenAvailable
  } = useWalletAdapter();

  const createTestTransaction = async () => {
    if (!publicKey || !connection) return null;

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: publicKey, // Self-send for testing (won't actually execute)
        lamports: 0.001 * LAMPORTS_PER_SOL,
      })
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicKey;

    return transaction;
  };

  const testWalletSigning = async () => {
    if (!publicKey || !connected) return;

    setTesting(true);
    setTestResults({});

    try {
      console.log('🧪 Starting wallet signing tests...');

      // Test single transaction signing
      try {
        const testTx = await createTestTransaction();
        if (testTx) {
          const signedTx = await signTransaction(testTx);
          setTestResults(prev => ({ ...prev, signTransaction: !!signedTx }));
          console.log('✅ Single transaction signing test passed');
        }
      } catch (error) {
        console.error('❌ Single transaction signing test failed:', error);
        setTestResults(prev => ({ 
          ...prev, 
          signTransaction: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
      }

      // Test batch transaction signing
      try {
        const testTx1 = await createTestTransaction();
        const testTx2 = await createTestTransaction();
        if (testTx1 && testTx2) {
          const signedTxs = await signAllTransactions([testTx1, testTx2]);
          setTestResults(prev => ({ ...prev, signAllTransactions: !!signedTxs && signedTxs.length === 2 }));
          console.log('✅ Batch transaction signing test passed');
        }
      } catch (error) {
        console.error('❌ Batch transaction signing test failed:', error);
        setTestResults(prev => ({ 
          ...prev, 
          signAllTransactions: false,
          error: prev.error || (error instanceof Error ? error.message : 'Unknown error')
        }));
      }

    } catch (error) {
      console.error('❌ Wallet signing tests failed:', error);
      setTestResults({ 
        signTransaction: false, 
        signAllTransactions: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (status: boolean | undefined) => {
    if (status === undefined) return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    return status ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />;
  };

  const getStatusColor = (status: boolean | undefined) => {
    if (status === undefined) return 'secondary';
    return status ? 'default' : 'destructive';
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Wallet Diagnostics
        </CardTitle>
        <CardDescription>
          Test and debug wallet functionality, especially Magic Eden wallet integration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Connection Status</label>
            <Badge variant={connected ? 'default' : 'secondary'}>
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Wallet Type</label>
            <Badge variant="outline">
              {walletName || 'None'}
            </Badge>
          </div>
        </div>

        {/* Magic Eden Availability */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Magic Eden Wallet</label>
          <Badge variant={isMagicEdenAvailable ? 'default' : 'secondary'}>
            {isMagicEdenAvailable ? 'Available' : 'Not Detected'}
          </Badge>
        </div>

        {/* Wallet Actions */}
        <div className="flex gap-2">
          {!connected ? (
            <Button onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          ) : (
            <Button variant="outline" onClick={disconnect}>
              Disconnect
            </Button>
          )}
          
          <Button 
            variant="outline" 
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showDetails ? 'Hide' : 'Show'} Details
          </Button>
        </div>

        {/* Detailed Information */}
        {showDetails && connected && (
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="text-sm">
              <strong>Public Key:</strong>
              <code className="ml-2 text-xs bg-background px-2 py-1 rounded">
                {publicKey?.toString().slice(0, 20)}...{publicKey?.toString().slice(-10)}
              </code>
            </div>
            <div className="text-sm">
              <strong>Connecting:</strong> {connecting ? 'Yes' : 'No'}
            </div>
            <div className="text-sm">
              <strong>Connection:</strong> {connection ? 'Active' : 'None'}
            </div>
          </div>
        )}

        {/* Transaction Signing Tests */}
        {connected && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Transaction Signing Tests</h3>
              <Button 
                size="sm" 
                onClick={testWalletSigning} 
                disabled={testing || !connected}
              >
                {testing ? 'Testing...' : 'Run Tests'}
              </Button>
            </div>

            {/* Test Results */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                {getStatusIcon(testResults.signTransaction)}
                <span className="text-sm">Single Transaction</span>
                <Badge variant={getStatusColor(testResults.signTransaction)}>
                  {testResults.signTransaction === undefined ? 'Not Tested' : 
                   testResults.signTransaction ? 'Pass' : 'Fail'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(testResults.signAllTransactions)}
                <span className="text-sm">Batch Transactions</span>
                <Badge variant={getStatusColor(testResults.signAllTransactions)}>
                  {testResults.signAllTransactions === undefined ? 'Not Tested' : 
                   testResults.signAllTransactions ? 'Pass' : 'Fail'}
                </Badge>
              </div>
            </div>

            {/* Error Display */}
            {testResults.error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">Test Error:</p>
                <p className="text-xs text-destructive/80 mt-1">{testResults.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>To test Magic Eden wallet:</strong>
            <br />
            1. Install Magic Eden wallet extension
            <br />
            2. Connect using the button above
            <br />
            3. Run the signing tests to verify functionality
            <br />
            4. Check browser console for detailed logs
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
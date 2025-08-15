import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoIcon, ShieldIcon, UsbIcon, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useLedgerWallet } from "@/hooks/useLedgerWallet";

export function LedgerWalletInfo() {
  const { 
    isLedger, 
    ledgerStatus, 
    browserSupported, 
    getLedgerInfo, 
    ledgerInstructions, 
    isLedgerConnected 
  } = useLedgerWallet();

  const ledgerInfo = getLedgerInfo();
  return (
    <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <CardTitle className="text-blue-900 dark:text-blue-100">
            Ledger Hardware Wallet
          </CardTitle>
          <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900">
            Cold Storage
          </Badge>
        </div>
        <CardDescription className="text-blue-700 dark:text-blue-300">
          Secure hardware wallet support for SOL recovery and token burning
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Browser Support Status */}
        <Alert className={`${
          browserSupported 
            ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
            : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
        }`}>
          {browserSupported ? (
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          )}
          <AlertDescription className="text-sm">
            <strong>Browser Compatibility:</strong> {
              browserSupported 
                ? 'Your browser supports Ledger hardware wallets ✓' 
                : 'Ledger requires Chrome or Edge browser with WebHID support'
            }
          </AlertDescription>
        </Alert>

        {/* Connection Status */}
        {isLedger && (
          <Alert className={`${
            isLedgerConnected 
              ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
              : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
          }`}>
            {isLedgerConnected ? (
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            )}
            <AlertDescription className="text-sm">
              <strong>Ledger Status:</strong> {
                isLedgerConnected 
                  ? `Connected - ${ledgerInfo?.publicKey?.slice(0, 8)}...${ledgerInfo?.publicKey?.slice(-8)}`
                  : 'Ledger wallet detected but not connected'
              }
            </AlertDescription>
          </Alert>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <UsbIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-blue-900 dark:text-blue-100">
                Connection Steps:
              </div>
              <div className="text-blue-700 dark:text-blue-300 space-y-1 mt-1">
                {ledgerInstructions.setup.map((step, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">
                      {index + 1}
                    </span>
                    <span className="text-xs">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex items-start gap-2">
            <ShieldIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-blue-900 dark:text-blue-100">
                Security Features:
              </div>
              <div className="text-blue-700 dark:text-blue-300 space-y-1 mt-1">
                <div>• Private keys never leave device</div>
                <div>• Transaction review on screen</div>
                <div>• Physical button confirmation</div>
                <div>• PIN/passphrase protection</div>
              </div>
            </div>
          </div>
        </div>

        <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <InfoIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
            <strong>Transaction Process:</strong> Ledger transactions require physical confirmation on your device. 
            Review each transaction carefully on the Ledger screen before approving with both buttons.
          </AlertDescription>
        </Alert>

        {/* Troubleshooting */}
        {!browserSupported && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="font-medium text-red-900 dark:text-red-100 text-sm mb-2">
              Browser Not Supported
            </div>
            <div className="text-red-700 dark:text-red-300 text-xs space-y-1">
              <div>• Use Chrome 89+ or Edge 89+ for Ledger support</div>
              <div>• WebHID must be enabled in browser settings</div>
              <div>• Firefox and Safari are not yet supported</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { Link } from 'wouter';
import { Eye, EyeOff, Copy, Send, RefreshCw, Lock, Unlock, Wallet, ExternalLink, ArrowLeft, Zap } from 'lucide-react';
import logoImage from '@assets/image_1757882056840.png';

export default function VaultAdmin() {
  const { toast } = useToast();
  const [adminSecret, setAdminSecret] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [botWalletCount, setBotWalletCount] = useState('3');
  const [botSolPerWallet, setBotSolPerWallet] = useState('0.05');
  const [botInterval, setBotInterval] = useState('60');
  const [botTokensPerCycle, setBotTokensPerCycle] = useState('10');
  const [isBotStarting, setIsBotStarting] = useState(false);
  const [isBotStopping, setIsBotStopping] = useState(false);

  const [gfsDistAmount, setGfsDistAmount] = useState('');
  const [gfsHolders, setGfsHolders] = useState<Array<{ wallet: string; balance: number }> | null>(null);
  const [isFetchingHolders, setIsFetchingHolders] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [distResult, setDistResult] = useState<any>(null);

  const vaultQuery = useQuery({
    queryKey: ['/api/coinflip/vault'],
    refetchInterval: authenticated ? 10000 : false,
  });

  const botStatusQuery = useQuery({
    queryKey: ['/api/admin/activity-bot/status', adminSecret],
    queryFn: async () => {
      const res = await fetch(`/api/admin/activity-bot/status?adminSecret=${encodeURIComponent(adminSecret)}`);
      if (!res.ok) throw new Error('Failed to fetch bot status');
      return res.json();
    },
    enabled: authenticated && !!adminSecret,
    refetchInterval: authenticated ? 5000 : false,
  });

  const vaultData = vaultQuery.data as any;

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (!adminSecret.trim()) {
      toast({ title: 'Enter your admin secret', variant: 'destructive' });
      return;
    }
    setIsLoggingIn(true);
    try {
      const res = await apiRequest('POST', '/api/coinflip/vault/verify', { adminSecret });
      const data = await res.json();
      if (data.success) {
        setAuthenticated(true);
        toast({ title: 'Authenticated', description: 'Vault controls unlocked' });
      } else {
        toast({ title: 'Wrong secret', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Wrong secret', description: 'The admin secret you entered is incorrect.', variant: 'destructive' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleExportKey = async () => {
    setIsExporting(true);
    try {
      const res = await apiRequest('POST', '/api/coinflip/vault/export-key', { adminSecret });
      const data = await res.json();
      if (data.success) {
        setPrivateKey(data.privateKey);
        setShowPrivateKey(true);
        toast({ title: 'Private key exported', description: 'Keep this safe - never share it!' });
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        setAuthenticated(false);
      }
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAddress.trim() || !withdrawAmount.trim()) {
      toast({ title: 'Fill in all fields', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setIsWithdrawing(true);
    try {
      const res = await apiRequest('POST', '/api/coinflip/vault/withdraw', {
        adminSecret,
        destinationAddress: withdrawAddress,
        amount: withdrawAmount,
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'Withdrawal successful!',
          description: `Sent ${amount} SOL. Remaining: ${data.remainingBalance.toFixed(4)} SOL`,
        });
        setWithdrawAddress('');
        setWithdrawAmount('');
        queryClient.invalidateQueries({ queryKey: ['/api/coinflip/vault'] });
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Withdrawal failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  const handleBotStart = async () => {
    setIsBotStarting(true);
    try {
      const res = await apiRequest('POST', '/api/admin/activity-bot/start', {
        adminSecret,
        walletCount: parseInt(botWalletCount) || 3,
        solPerWallet: parseFloat(botSolPerWallet) || 0.05,
        intervalSeconds: parseInt(botInterval) || 60,
        tokensPerCycle: parseInt(botTokensPerCycle) || 10,
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Activity Bot started!', description: `${botWalletCount} wallets funded and running` });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/activity-bot/status', adminSecret] });
      } else {
        toast({ title: 'Failed to start', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsBotStarting(false);
    }
  };

  const handleFetchHolders = async () => {
    setIsFetchingHolders(true);
    setGfsHolders(null);
    setDistResult(null);
    try {
      const res = await fetch(`/api/admin/gfs-distribution/holders?adminSecret=${encodeURIComponent(adminSecret)}`);
      const data = await res.json();
      if (data.success) {
        setGfsHolders(data.holders);
        toast({ title: `Found ${data.count} eligible holders` });
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsFetchingHolders(false);
    }
  };

  const handleDistribute = async () => {
    const amount = parseFloat(gfsDistAmount);
    if (!amount || amount <= 0) {
      toast({ title: 'Enter a valid token amount', variant: 'destructive' });
      return;
    }
    if (!gfsHolders || gfsHolders.length === 0) {
      toast({ title: 'Fetch holders first', variant: 'destructive' });
      return;
    }
    setIsDistributing(true);
    setDistResult(null);
    try {
      const res = await apiRequest('POST', '/api/admin/gfs-distribution/distribute', { adminSecret, totalTokens: amount });
      const data = await res.json();
      if (data.success) {
        setDistResult(data);
        toast({ title: 'Distribution complete!', description: `Sent to ${data.totalHolders} holders` });
      } else {
        toast({ title: 'Distribution failed', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsDistributing(false);
    }
  };

  const handleBotStop = async () => {
    setIsBotStopping(true);
    try {
      const res = await apiRequest('POST', '/api/admin/activity-bot/stop', { adminSecret });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Activity Bot stopped', description: 'SOL is being drained back to vault' });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/activity-bot/status', adminSecret] });
      } else {
        toast({ title: 'Failed to stop', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsBotStopping(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      <div className="container mx-auto pt-1 pb-2 max-w-6xl flex-grow px-4">
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <Link href="/">
                <img
                  src={logoImage}
                  alt="Get your SOL back!"
                  className="h-[100px] w-[100px] cursor-pointer"
                />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/">
                <Button className="bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-md px-3 py-1.5 text-white text-xs border border-purple-500/30 flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" />
                  <span>Back</span>
                </Button>
              </Link>
              {authenticated && (
                <Button
                  onClick={() => { setAuthenticated(false); setAdminSecret(''); setPrivateKey(''); setShowPrivateKey(false); }}
                  className="bg-red-800/60 hover:bg-red-700/60 backdrop-blur-sm rounded-md px-3 py-1.5 text-white text-xs border border-red-500/30 flex items-center gap-1"
                >
                  <Lock className="h-3 w-3" />
                  <span>Lock</span>
                </Button>
              )}
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-bold text-center text-white mb-2">
            Coin Flip Vault
          </h1>

          {!authenticated ? (
            /* Login Card */
            <div className="max-w-md mx-auto">
              <div className="bg-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <div className="text-center mb-5">
                  <div className="text-4xl mb-3">🔐</div>
                  <p className="text-gray-300 text-sm">Enter your admin secret to manage the vault</p>
                </div>
                <div className="space-y-4">
                  <Input
                    type="password"
                    placeholder="Admin Secret"
                    value={adminSecret}
                    onChange={(e) => setAdminSecret(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="bg-black/40 border-purple-500/30 text-white"
                  />
                  <Button
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {isLoggingIn ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Unlock className="w-4 h-4 mr-2" />}
                    {isLoggingIn ? 'Verifying...' : 'Unlock Vault'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Balance + Address Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                  <p className="text-4xl font-bold text-white">
                    {vaultData?.balance !== undefined ? Number(vaultData.balance).toFixed(4) : '...'}
                  </p>
                  <p className="text-sm text-gray-300 uppercase tracking-wider mt-1">SOL Balance</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => vaultQuery.refetch()}
                    className="text-purple-300 hover:text-white mt-2"
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${vaultQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
                  </Button>
                </div>
                <div className="bg-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                  <p className="text-sm text-gray-300 uppercase tracking-wider mb-2">Vault Address</p>
                  <code className="text-xs sm:text-sm text-purple-300 font-mono break-all">
                    {vaultData?.address || '...'}
                  </code>
                  <div className="flex justify-center gap-2 mt-3">
                    {vaultData?.address && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(vaultData.address, 'Address')}
                          className="text-purple-300 hover:text-white"
                        >
                          <Copy className="w-3 h-3 mr-1" /> Copy
                        </Button>
                        <a href={`https://solscan.io/account/${vaultData.address}`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="text-purple-300 hover:text-white">
                            <ExternalLink className="w-3 h-3 mr-1" /> Solscan
                          </Button>
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>


              {/* Private Key Export */}
              <div className="bg-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  🔑 Private Key
                </h2>
                <p className="text-sm text-gray-400 mb-4">
                  Export to import into Phantom or any Solana wallet for full access.
                </p>
                {showPrivateKey && privateKey ? (
                  <div className="space-y-3">
                    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                      <p className="text-xs text-red-400 font-semibold mb-2">KEEP THIS SECRET - NEVER SHARE!</p>
                      <code className="text-xs text-red-300 font-mono break-all select-all">
                        {privateKey}
                      </code>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => copyToClipboard(privateKey, 'Private key')}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        <Copy className="w-3 h-3 mr-1" /> Copy Key
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowPrivateKey(false); setPrivateKey(''); }}
                        className="border-gray-500/30 text-gray-300"
                      >
                        <EyeOff className="w-3 h-3 mr-1" /> Hide
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={handleExportKey}
                    disabled={isExporting}
                    className="bg-yellow-600 hover:bg-yellow-700 text-black font-semibold"
                  >
                    {isExporting ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    {isExporting ? 'Exporting...' : 'Export Private Key'}
                  </Button>
                )}
              </div>

              {/* GFS Token Distribution */}
              <div className="bg-purple-900/30 backdrop-blur-sm rounded-xl border-2 border-yellow-500/50 p-6">
                <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                  👑 $GFS Token Distribution
                </h2>
                <p className="text-sm text-gray-400 mb-4">
                  Distribute GFS tokens equally to all wallets holding 1,000,000+ $GFS. Tokens are sent from the platform wallet.
                </p>

                {/* Step 1: Fetch holders */}
                <div className="mb-4">
                  <Button onClick={handleFetchHolders} disabled={isFetchingHolders} className="bg-blue-600 hover:bg-blue-700">
                    {isFetchingHolders ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Wallet className="w-4 h-4 mr-2" />}
                    {isFetchingHolders ? 'Scanning holders...' : 'Step 1 — Scan Eligible Holders'}
                  </Button>
                </div>

                {gfsHolders !== null && (
                  <div className="bg-black/30 rounded-lg p-4 mb-4 border border-yellow-500/20">
                    <p className="text-yellow-300 font-semibold mb-1">✅ {gfsHolders.length} eligible holders found (1M+ $GFS)</p>
                    {gfsHolders.length > 0 && gfsDistAmount && parseFloat(gfsDistAmount) > 0 && (
                      <p className="text-gray-300 text-sm mt-1">
                        Each holder receives: <span className="text-white font-semibold">{(parseFloat(gfsDistAmount) / gfsHolders.length).toLocaleString(undefined, { maximumFractionDigits: 2 })} $GFS</span>
                      </p>
                    )}
                    {gfsHolders.length > 0 && (
                      <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                        {gfsHolders.slice(0, 20).map((h, i) => (
                          <div key={i} className="flex justify-between text-xs text-gray-400">
                            <span className="font-mono">{h.wallet.slice(0, 12)}…</span>
                            <span>{h.balance.toLocaleString()} $GFS</span>
                          </div>
                        ))}
                        {gfsHolders.length > 20 && <p className="text-xs text-gray-500">…and {gfsHolders.length - 20} more</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Enter amount + distribute */}
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Step 2 — Total $GFS to Distribute</label>
                    <Input
                      type="number"
                      placeholder="e.g. 1000000"
                      value={gfsDistAmount}
                      onChange={e => setGfsDistAmount(e.target.value)}
                      className="bg-black/40 border-yellow-500/30 text-white"
                    />
                  </div>
                  <Button
                    onClick={handleDistribute}
                    disabled={isDistributing || !gfsHolders || gfsHolders.length === 0 || !gfsDistAmount}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                  >
                    {isDistributing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    {isDistributing ? 'Distributing...' : 'Distribute Now'}
                  </Button>
                </div>

                {/* Result */}
                {distResult && (
                  <div className="mt-4 bg-green-900/20 border border-green-500/30 rounded-lg p-4 space-y-2">
                    <p className="text-green-400 font-semibold">✅ Distribution Complete</p>
                    <p className="text-sm text-gray-300">Sent to <span className="text-white font-semibold">{distResult.totalHolders}</span> holders</p>
                    <p className="text-sm text-gray-300">Each received: <span className="text-white font-semibold">{distResult.perHolderTokens?.toLocaleString(undefined, { maximumFractionDigits: 2 })} $GFS</span></p>
                    <p className="text-sm text-gray-300">Transactions: <span className="text-white font-semibold">{distResult.signatures?.length}</span></p>
                    {distResult.errors?.length > 0 && (
                      <div className="text-xs text-red-400 mt-1">
                        {distResult.errors.map((e: string, i: number) => <div key={i}>{e}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Withdraw */}
              <div className="bg-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <Send className="w-5 h-5 text-purple-400" /> Withdraw SOL
                </h2>
                <p className="text-sm text-gray-400 mb-4">
                  Send SOL from the vault to any Solana wallet address.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Destination Address</label>
                    <Input
                      placeholder="Solana wallet address..."
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value)}
                      className="bg-black/40 border-purple-500/30 text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Amount (SOL)</label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.0"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="bg-black/40 border-purple-500/30 text-white"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <Button
                    onClick={handleWithdraw}
                    disabled={isWithdrawing || !withdrawAddress || !withdrawAmount}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isWithdrawing ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {isWithdrawing ? 'Sending...' : 'Withdraw'}
                  </Button>
                  {vaultData?.balance !== undefined && (
                    <button
                      onClick={() => setWithdrawAmount(Math.max(0, Number(vaultData.balance) - 0.01).toFixed(4))}
                      className="text-xs text-purple-400 hover:text-purple-300 underline"
                    >
                      Max ({Math.max(0, Number(vaultData.balance) - 0.01).toFixed(4)} SOL)
                    </button>
                  )}
                </div>
              </div>

              {/* Activity Bot */}
              <div className="bg-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" /> Activity Bot
                </h2>
                <p className="text-sm text-gray-400 mb-4">
                  Automatically swaps tokens and closes empty ATAs using vault wallets to generate platform activity.
                </p>

                {/* Status banner */}
                {botStatusQuery.data && (
                  <div className={`rounded-lg p-3 mb-4 flex items-center justify-between border ${botStatusQuery.data.running ? 'bg-green-900/30 border-green-500/30' : 'bg-gray-900/40 border-gray-600/30'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${botStatusQuery.data.running ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                      <div>
                        <p className="text-white font-semibold text-sm">
                          {botStatusQuery.data.running ? `Running — ${botStatusQuery.data.walletCount} wallets` : `Stopped (${botStatusQuery.data.phase})`}
                        </p>
                        <p className="text-gray-400 text-xs">{botStatusQuery.data.phaseMessage || `${botStatusQuery.data.totalTxCount} total txs`}</p>
                      </div>
                    </div>
                    {botStatusQuery.data.nextRunIn != null && (
                      <span className="text-xs text-gray-400">next in {Math.round(botStatusQuery.data.nextRunIn / 1000)}s</span>
                    )}
                  </div>
                )}

                {/* Config */}
                {(!botStatusQuery.data?.running) && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Wallets</label>
                      <Input type="number" min="1" max="10" value={botWalletCount} onChange={e => setBotWalletCount(e.target.value)} className="bg-black/40 border-purple-500/30 text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">SOL / wallet</label>
                      <Input type="number" step="0.01" min="0.01" value={botSolPerWallet} onChange={e => setBotSolPerWallet(e.target.value)} className="bg-black/40 border-purple-500/30 text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Interval (sec)</label>
                      <Input type="number" min="10" value={botInterval} onChange={e => setBotInterval(e.target.value)} className="bg-black/40 border-purple-500/30 text-white" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Tokens / cycle</label>
                      <Input type="number" min="1" max="20" value={botTokensPerCycle} onChange={e => setBotTokensPerCycle(e.target.value)} className="bg-black/40 border-purple-500/30 text-white" />
                    </div>
                  </div>
                )}

                {/* Start / Stop buttons */}
                <div className="flex gap-3 mb-4">
                  {!botStatusQuery.data?.running ? (
                    <Button onClick={handleBotStart} disabled={isBotStarting} className="bg-green-600 hover:bg-green-700">
                      {isBotStarting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                      {isBotStarting ? 'Starting...' : 'Start Bot'}
                    </Button>
                  ) : (
                    <Button onClick={handleBotStop} disabled={isBotStopping} className="bg-red-600 hover:bg-red-700">
                      {isBotStopping ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {isBotStopping ? 'Stopping...' : 'Stop Bot'}
                    </Button>
                  )}
                </div>

                {/* Per-wallet table */}
                {botStatusQuery.data?.wallets?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-purple-500/20 text-gray-400 uppercase">
                          <th className="pb-2 pr-3">#</th>
                          <th className="pb-2 pr-3">Address</th>
                          <th className="pb-2 pr-3">Balance</th>
                          <th className="pb-2 pr-3">Txs</th>
                          <th className="pb-2 pr-3">Step</th>
                          <th className="pb-2">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {botStatusQuery.data.wallets.map((w: any, i: number) => (
                          <tr key={i} className="border-b border-purple-500/10 last:border-0">
                            <td className="py-1.5 pr-3 text-gray-400">{i + 1}</td>
                            <td className="py-1.5 pr-3">
                              <a href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-white font-mono">
                                {w.address.slice(0, 8)}…
                              </a>
                            </td>
                            <td className="py-1.5 pr-3 text-white">{w.balance.toFixed(4)}</td>
                            <td className="py-1.5 pr-3 text-white">{w.txCount}</td>
                            <td className="py-1.5 pr-3 text-yellow-300">{w.step}</td>
                            <td className="py-1.5 text-red-400 max-w-[150px] truncate">{w.lastError || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Fund Instructions */}
              <div className="bg-purple-900/30 backdrop-blur-sm rounded-xl border border-green-500/20 p-6">
                <h2 className="text-lg font-semibold text-white mb-3">💰 Fund the Vault</h2>
                <p className="text-sm text-gray-400 mb-3">
                  Send SOL to the vault address below to fund coin flip payouts.
                </p>
                {vaultData?.address && (
                  <div className="flex items-center gap-2 bg-black/40 rounded-lg p-3 border border-green-500/20">
                    <code className="text-sm text-green-300 font-mono break-all flex-1">
                      {vaultData.address}
                    </code>
                    <button
                      onClick={() => copyToClipboard(vaultData.address, 'Vault address')}
                      className="text-gray-400 hover:text-white shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

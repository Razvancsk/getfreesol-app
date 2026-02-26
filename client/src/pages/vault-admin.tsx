import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { Link } from 'wouter';
import { Eye, EyeOff, Copy, Send, RefreshCw, Lock, Unlock, Wallet, ExternalLink, ArrowLeft, Play, Square, Bot, AlertCircle, CheckCircle, Zap } from 'lucide-react';
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

  // Activity bot config
  const [botWalletCount, setBotWalletCount] = useState('5');
  const [botSolPerWallet, setBotSolPerWallet] = useState('0.02');
  const [botInterval, setBotInterval] = useState('60');
  const [botTokensPerCycle, setBotTokensPerCycle] = useState('20');
  const [isBotStarting, setIsBotStarting] = useState(false);
  const [isBotStopping, setIsBotStopping] = useState(false);

  const vaultQuery = useQuery({
    queryKey: ['/api/coinflip/vault'],
    refetchInterval: authenticated ? 10000 : false,
  });

  const botStatusQuery = useQuery({
    queryKey: ['/api/admin/activity-bot/status'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/activity-bot/status?adminSecret=${encodeURIComponent(adminSecret)}`);
      if (!res.ok) throw new Error('Unauthorized');
      return res.json();
    },
    enabled: authenticated && !!adminSecret,
    refetchInterval: authenticated ? 5000 : false,
  });

  const vaultData = vaultQuery.data as any;
  const botStatus = botStatusQuery.data as any;

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

  const handleBotStart = async () => {
    const count = parseInt(botWalletCount);
    const sol = parseFloat(botSolPerWallet);
    const secs = parseInt(botInterval);
    if (isNaN(count) || count < 1 || count > 10) {
      toast({ title: 'Wallet count must be 1–10', variant: 'destructive' });
      return;
    }
    if (isNaN(sol) || sol < 0.005) {
      toast({ title: 'SOL per wallet must be at least 0.005', variant: 'destructive' });
      return;
    }
    if (isNaN(secs) || secs < 5) {
      toast({ title: 'Interval must be at least 5 seconds', variant: 'destructive' });
      return;
    }
    const tpc = parseInt(botTokensPerCycle);
    if (isNaN(tpc) || tpc < 1 || tpc > 20) {
      toast({ title: 'Tokens per cycle must be 1–20', variant: 'destructive' });
      return;
    }
    setIsBotStarting(true);
    try {
      const res = await apiRequest('POST', '/api/admin/activity-bot/start', {
        adminSecret,
        walletCount: count,
        solPerWallet: sol,
        intervalSeconds: secs,
        tokensPerCycle: tpc,
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Activity bot started!', description: `${count} wallets funded and running swaps.` });
        botStatusQuery.refetch();
      } else {
        toast({ title: 'Failed to start bot', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsBotStarting(false);
    }
  };

  const handleBotStop = async () => {
    setIsBotStopping(true);
    try {
      const res = await apiRequest('POST', '/api/admin/activity-bot/stop', { adminSecret });
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'Bot stopped',
          description: `Drained ${data.drainSigs?.length || 0} wallet(s) back to vault.`,
        });
        botStatusQuery.refetch();
        vaultQuery.refetch();
      } else {
        toast({ title: 'Error stopping bot', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsBotStopping(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  const isRunning = botStatus?.running;
  const isBusy = isBotStarting || isBotStopping || botStatus?.phase === 'funding' || botStatus?.phase === 'draining';

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

              {/* ============ ACTIVITY BOT ============ */}
              <div className="bg-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Bot className="w-5 h-5 text-purple-400" />
                    Phantom Activity Bot
                  </h2>
                  <div className="flex items-center gap-2">
                    {isRunning ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 border border-green-400/30 rounded-full px-3 py-1">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                        RUNNING
                      </span>
                    ) : botStatus?.phase === 'funding' || botStatus?.phase === 'draining' ? (
                      <span className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded-full px-3 py-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        {botStatus.phase === 'funding' ? 'FUNDING' : 'DRAINING'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-400/10 border border-gray-400/30 rounded-full px-3 py-1">
                        <Square className="w-3 h-3" />
                        STOPPED
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-400 mb-5">
                  Generates real Solana transactions from multiple wallets to boost Phantom Discovery visibility.
                  Vault funds wallets on start, drains them back on stop.
                </p>

                {/* Phase message */}
                {botStatus?.phaseMessage && (
                  <div className="mb-4 flex items-center gap-2 text-sm text-yellow-300 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    {botStatus.phaseMessage}
                  </div>
                )}

                {!isRunning && botStatus?.phase !== 'funding' && botStatus?.phase !== 'draining' ? (
                  /* Config form */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
                          Number of Wallets (1–10)
                        </label>
                        <Input
                          type="number"
                          min="1"
                          max="10"
                          value={botWalletCount}
                          onChange={(e) => setBotWalletCount(e.target.value)}
                          className="bg-black/40 border-purple-500/30 text-white"
                          placeholder="5"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
                          SOL per Wallet
                        </label>
                        <Input
                          type="number"
                          min="0.005"
                          step="0.005"
                          value={botSolPerWallet}
                          onChange={(e) => setBotSolPerWallet(e.target.value)}
                          className="bg-black/40 border-purple-500/30 text-white"
                          placeholder="0.02"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Total: ~{(parseFloat(botSolPerWallet || '0') * parseInt(botWalletCount || '0')).toFixed(3)} SOL
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
                          Cooldown (seconds)
                        </label>
                        <Input
                          type="number"
                          min="5"
                          value={botInterval}
                          onChange={(e) => setBotInterval(e.target.value)}
                          className="bg-black/40 border-purple-500/30 text-white"
                          placeholder="60"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
                          Tokens per Cycle (1–20)
                        </label>
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          value={botTokensPerCycle}
                          onChange={(e) => setBotTokensPerCycle(e.target.value)}
                          className="bg-black/40 border-purple-500/30 text-white"
                          placeholder="20"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Max 20 (batch ATA close limit)
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 space-y-1">
                      <p className="font-semibold text-blue-200">How it works:</p>
                      <p>• Vault generates {botWalletCount || 'N'} fresh wallets and sends {botSolPerWallet || '0.02'} SOL to each</p>
                      <p>• Each cycle: buys {botTokensPerCycle || '20'} random tokens (0.002 SOL each), swaps them back to SOL, then batch-closes all empty ATAs in one tx</p>
                      <p>• 15% platform fee collected on-chain at ATA close — max 20 accounts closed per transaction</p>
                      <p>• Transactions appear in Phantom Discovery as real dApp activity</p>
                      <p>• On Stop: all remaining SOL is drained back to the vault automatically</p>
                    </div>

                    <Button
                      onClick={handleBotStart}
                      disabled={isBusy}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold"
                    >
                      {isBotStarting ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      {isBotStarting ? 'Funding wallets...' : 'Start Activity Bot'}
                    </Button>
                  </div>
                ) : (
                  /* Running status */
                  <div className="space-y-4">
                    {/* Stats row */}
                    {botStatus && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-black/30 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-white">{botStatus.walletCount}</p>
                          <p className="text-xs text-gray-400 mt-1">Active Wallets</p>
                        </div>
                        <div className="bg-black/30 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-green-400">{botStatus.totalTxCount}</p>
                          <p className="text-xs text-gray-400 mt-1">Total Swaps</p>
                        </div>
                        <div className="bg-black/30 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-purple-400">{botStatus.intervalSeconds}s</p>
                          <p className="text-xs text-gray-400 mt-1">Cooldown</p>
                        </div>
                        <div className="bg-black/30 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-yellow-400">
                            {botStatus.nextRunIn !== null ? `${Math.floor(botStatus.nextRunIn / 60)}m ${botStatus.nextRunIn % 60}s` : '—'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">Next Round</p>
                        </div>
                      </div>
                    )}

                    {/* Wallet table */}
                    {botStatus?.wallets && botStatus.wallets.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b border-white/10">
                              <th className="text-left pb-2 pr-3">#</th>
                              <th className="text-left pb-2 pr-3">Wallet</th>
                              <th className="text-right pb-2 pr-3">Balance</th>
                              <th className="text-right pb-2 pr-3">Swaps</th>
                              <th className="text-left pb-2">Last Tx</th>
                            </tr>
                          </thead>
                          <tbody>
                            {botStatus.wallets.map((w: any, i: number) => (
                              <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                                <td className="py-2 pr-3 text-gray-500">{i + 1}</td>
                                <td className="py-2 pr-3">
                                  <a
                                    href={`https://solscan.io/account/${w.address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-purple-300 hover:text-white font-mono"
                                  >
                                    {w.address.slice(0, 8)}…{w.address.slice(-6)}
                                  </a>
                                </td>
                                <td className="py-2 pr-3 text-right text-white font-mono">
                                  {w.balance.toFixed(4)} SOL
                                </td>
                                <td className="py-2 pr-3 text-right text-green-400">{w.txCount}</td>
                                <td className="py-2">
                                  {w.lastError ? (
                                    <span className="text-red-400 flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3 shrink-0" />
                                      {w.lastError.slice(0, 40)}
                                    </span>
                                  ) : w.lastTxSig ? (
                                    <a
                                      href={`https://solscan.io/tx/${w.lastTxSig}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-green-400 hover:text-green-300 flex items-center gap-1"
                                    >
                                      <CheckCircle className="w-3 h-3 shrink-0" />
                                      {w.lastTxSig.slice(0, 12)}…
                                    </a>
                                  ) : (
                                    <span className="text-gray-600">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <Button
                      onClick={handleBotStop}
                      disabled={isBusy}
                      className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                    >
                      {isBotStopping ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Square className="w-4 h-4 mr-2" />
                      )}
                      {isBotStopping ? 'Draining wallets back...' : 'Stop & Drain Wallets'}
                    </Button>
                  </div>
                )}
              </div>
              {/* ============ END ACTIVITY BOT ============ */}

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

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Flame, Sparkles, Rocket, RefreshCw, Search, ExternalLink } from 'lucide-react';

type FeedType = 'new' | 'bonding' | 'migrated';

type Token = {
  mint: string;
  name?: string;
  symbol?: string;
  imageUri?: string;
  pool?: string;
  launchpad?: string;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
  bondingPct?: number;
  createdAt?: number;
  lastSeen?: number;
  buys?: number;
  sells?: number;
  migrated?: boolean;
};

const TABS: { id: FeedType; label: string; icon: any; sub: string }[] = [
  { id: 'new',       label: 'New',           icon: Sparkles, sub: 'All launchpads' },
  { id: 'bonding',   label: 'Almost Bonding', icon: Flame,    sub: '60%+ to bond' },
  { id: 'migrated',  label: 'Migrated',      icon: Rocket,   sub: 'Graduated to AMM' },
];

function ago(ts?: number) {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function fmtSol(n?: number) {
  if (!n || !Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function shortMint(m: string) {
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

export default function TerminalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-purple-950 to-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-white/70 hover:text-white">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Terminal</h1>
            <p className="text-white/60 text-xs">Live Solana launchpad screener · Pump.fun · LetsBonk · Meteora · Bags · Moonshot</p>
          </div>
        </div>
        <TerminalView />
      </div>
    </div>
  );
}

export function TerminalView() {
  const [tab, setTab] = useState<FeedType>('new');
  const [search, setSearch] = useState('');
  const [tradeFor, setTradeFor] = useState<{ token: Token; action: 'buy' | 'sell' } | null>(null);

  const { data, refetch, isFetching } = useQuery<{ tokens: Token[]; status: any }>({
    queryKey: ['/api/terminal/feed', tab],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/feed?type=${tab}&limit=80`);
      if (!r.ok) throw new Error('feed failed');
      return r.json();
    },
    refetchInterval: 3000,
  });

  const tokens = useMemo(() => {
    const list = data?.tokens ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(t =>
      (t.symbol || '').toLowerCase().includes(q) ||
      (t.name || '').toLowerCase().includes(q) ||
      t.mint.toLowerCase().includes(q),
    );
  }, [data, search]);

  const status = data?.status;

  return (
    <div className="text-white">
      <div>
        <div className="flex items-center justify-end mb-4">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-1 rounded-full border ${
              status?.connected ? 'border-green-500/40 text-green-300 bg-green-500/10'
                                : 'border-yellow-500/40 text-yellow-300 bg-yellow-500/10'
            }`}>
              {status?.connected ? 'LIVE' : 'CONNECTING…'}
            </span>
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-left rounded-xl p-3 border transition ${
                  active
                    ? 'bg-purple-600/30 border-purple-400/60 text-white'
                    : 'bg-purple-900/20 border-white/10 text-white/70 hover:bg-purple-900/40'
                }`}
                data-testid={`tab-${t.id}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="font-semibold text-sm">{t.label}</span>
                </div>
                <div className="text-[10px] text-white/50 mt-0.5">{t.sub}</div>
              </button>
            );
          })}
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter symbol, name or mint…"
            className="pl-9 bg-black/30 border-white/10 text-white placeholder:text-white/30"
            data-testid="input-search"
          />
        </div>

        <div className="bg-purple-900/20 border border-white/10 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-white/50 border-b border-white/10">
            <div className="col-span-5">Token</div>
            <div className="col-span-2 text-right">MC (SOL)</div>
            <div className="col-span-2 text-right">{tab === 'bonding' ? 'Bond' : tab === 'migrated' ? 'Migrated' : 'Age'}</div>
            <div className="col-span-3 text-right">Action</div>
          </div>
          <div className="max-h-[64vh] overflow-y-auto">
            {tokens.length === 0 && (
              <div className="px-4 py-12 text-center text-white/50 text-sm">
                {isFetching ? 'Loading feed…' : 'No tokens yet — waiting for stream events.'}
              </div>
            )}
            {tokens.map((t) => (
              <div
                key={t.mint}
                className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-white/5 hover:bg-purple-800/20 items-center"
                data-testid={`row-${t.mint}`}
              >
                <div className="col-span-5 flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-purple-700/40 flex items-center justify-center overflow-hidden shrink-0">
                    {t.imageUri
                      ? <img src={t.imageUri} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                      : <span className="text-xs font-bold">{(t.symbol || '?').slice(0, 2)}</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                      <span>{t.symbol || 'UNKN'}</span>
                      <span className="text-white/40 font-normal truncate">· {t.name || shortMint(t.mint)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {t.launchpad && (
                        <span className="text-[9px] px-1.5 py-px rounded bg-purple-500/20 border border-purple-400/30 text-purple-200 font-semibold uppercase tracking-wide shrink-0">
                          {t.launchpad}
                        </span>
                      )}
                      <a
                        href={`https://solscan.io/token/${t.mint}`}
                        target="_blank" rel="noreferrer"
                        className="text-[10px] text-white/40 font-mono hover:text-white/70 inline-flex items-center gap-1"
                      >
                        {shortMint(t.mint)} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
                <div className="col-span-2 text-right text-sm tabular-nums">{fmtSol(t.marketCapSol)}</div>
                <div className="col-span-2 text-right text-sm tabular-nums">
                  {tab === 'bonding'
                    ? <span className="text-orange-300 font-bold">{Math.round((t.bondingPct ?? 0) * 100)}%</span>
                    : tab === 'migrated'
                      ? <span className="text-green-300">{ago(t.lastSeen)} ago</span>
                      : <span className="text-white/70">{ago(t.createdAt)}</span>}
                </div>
                <div className="col-span-3 flex justify-end gap-1.5">
                  <Button size="sm" className="h-7 px-2.5 text-xs bg-green-600 hover:bg-green-500" onClick={() => setTradeFor({ token: t, action: 'buy' })} data-testid={`buy-${t.mint}`}>
                    Buy
                  </Button>
                  <Button size="sm" className="h-7 px-2.5 text-xs bg-red-600 hover:bg-red-500" onClick={() => setTradeFor({ token: t, action: 'sell' })} data-testid={`sell-${t.mint}`}>
                    Sell
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[10px] text-white/40 text-center mt-3">
          {status ? `${status.tracked} tokens tracked · feed ${status.lastEventAgeMs ? Math.floor(status.lastEventAgeMs / 1000) + 's' : '—'} ago` : ''}
          · Trades: 0.25% pumpapi fee + network fee. No private key leaves your wallet.
        </div>
      </div>

      {tradeFor && (
        <TradeDialog
          token={tradeFor.token}
          action={tradeFor.action}
          onClose={() => setTradeFor(null)}
        />
      )}
    </div>
  );
}

function TradeDialog({ token, action, onClose }: { token: Token; action: 'buy' | 'sell'; onClose: () => void }) {
  const { publicKey, signTransaction } = useWallet();
  const { toast } = useToast();
  const [amount, setAmount] = useState(action === 'buy' ? '0.01' : '100%');
  const [slippage, setSlippage] = useState('20');
  const [busy, setBusy] = useState(false);
  const [sig, setSig] = useState<string | null>(null);

  const denominatedInQuote = action === 'buy'; // buy: amount is SOL; sell: amount is tokens (or "100%")

  async function submit() {
    if (!publicKey) { toast({ title: 'Connect wallet first' }); return; }
    if (!signTransaction) { toast({ title: 'Wallet does not support signing', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/terminal/build-tx', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: publicKey.toBase58(),
          action, mint: token.mint,
          amount: action === 'sell' && amount.trim() === '100%' ? '100%' : Number(amount),
          denominatedInQuote,
          slippage: Number(slippage),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'build failed');
      let tx: VersionedTransaction;
      try {
        tx = VersionedTransaction.deserialize(Uint8Array.from(atob(j.tx), c => c.charCodeAt(0)));
      } catch {
        throw new Error('Server returned an unreadable transaction');
      }
      const signed = await signTransaction(tx);
      // Use Helius public RPC if available via env, else mainnet-beta
      const heliusKey = (import.meta as any).env?.VITE_HELIUS_API_KEY;
      const rpc = heliusKey
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
        : 'https://api.mainnet-beta.solana.com';
      const conn = new Connection(rpc, 'confirmed');
      const signature = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
      setSig(signature);
      toast({ title: `${action === 'buy' ? 'Buy' : 'Sell'} sent`, description: signature.slice(0, 12) + '…' });
    } catch (e: any) {
      toast({ title: 'Trade failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-slate-900 border-purple-500/40 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {action === 'buy' ? 'Buy' : 'Sell'} {token.symbol || shortMint(token.mint)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-white/60 text-xs font-mono break-all">{token.mint}</div>
          <div>
            <label className="text-xs text-white/60">Amount {action === 'buy' ? '(SOL)' : '(tokens, or "100%")'}</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-black/40 border-white/10 mt-1" data-testid="input-amount" />
          </div>
          <div>
            <label className="text-xs text-white/60">Slippage (%)</label>
            <Input value={slippage} onChange={(e) => setSlippage(e.target.value)} className="bg-black/40 border-white/10 mt-1" data-testid="input-slippage" />
          </div>
          {sig && (
            <div className="text-xs">
              <a className="text-green-300 underline" href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer">View on Solscan</a>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
          <Button
            onClick={submit}
            disabled={busy || !publicKey}
            className={action === 'buy' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}
            data-testid="button-confirm-trade"
          >
            {busy ? 'Sending…' : `${action === 'buy' ? 'Buy' : 'Sell'} now`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

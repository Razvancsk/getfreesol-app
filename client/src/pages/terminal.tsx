import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useReownWallet } from '@/hooks/useReownWallet';
import logoImage from '@assets/image_1757882056840.png';
import { VersionedTransaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Flame, Sparkles, Rocket, Search, ExternalLink, TrendingUp, TrendingDown, Copy, Globe, Send, MessageCircle, Droplet, Hammer, ArrowDownUp, Zap, Settings, Wallet as WalletIcon, Bell, Users, Activity, BarChart2, SlidersHorizontal, X as XIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SiX, SiDiscord, SiTelegram } from 'react-icons/si';

type FeedType = 'new' | 'bonding' | 'migrated' | 'trending' | 'signals';

type Token = {
  mint: string;
  name?: string;
  symbol?: string;
  imageUri?: string;
  pool?: string;
  launchpad?: string;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
  marketCapUsd?: number;
  priceUsd?: number;
  pctChange?: number;
  liquidityUsd?: number;
  volumeUsd?: number;
  bondingPct?: number;
  createdAt?: number;
  lastSeen?: number;
  buys?: number;
  sells?: number;
  txns?: number;
  migrated?: boolean;
  smartDegens?: number;
  renownedCount?: number;
  rugRatio?: number;
  ratTraderRate?: number;
  bundlerRate?: number;
};

function fmtUsd(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n > 0) return `$${n.toPrecision(3)}`;
  return '$0';
}

// Crypto-style subscript notation for tiny prices, e.g. 0.00004016 → $0.0₄4016
const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
function fmtPriceUsd(n?: number): JSX.Element {
  if (n == null || !Number.isFinite(n) || n <= 0) return <>—</>;
  if (n >= 1) return <>${n.toFixed(2)}</>;
  if (n >= 0.01) return <>${n.toFixed(4)}</>;
  // Count leading zeros after "0."
  const s = n.toFixed(20);
  const dot = s.indexOf('.');
  let zeros = 0;
  let i = dot + 1;
  while (i < s.length && s[i] === '0') { zeros++; i++; }
  const sig = s.slice(i, i + 4).replace(/0+$/, '') || '0';
  if (zeros < 4) {
    return <>${'0.' + '0'.repeat(zeros) + sig}</>;
  }
  const subZeros = zeros < 10 ? SUB_DIGITS[zeros] : String(zeros);
  return <>$0.0{subZeros}{sig}</>;
}
const AVATAR_COLORS = ['bg-pink-600', 'bg-purple-600', 'bg-indigo-600', 'bg-blue-600', 'bg-emerald-600', 'bg-orange-600', 'bg-rose-600', 'bg-fuchsia-600'];
function colorFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
// Module-level cache: mint → fetched image URL (or '' if not found), persists across re-renders
const _imgCache = new Map<string, string>();

function TokenAvatar({ token, bondPct, migrated, size = 92 }: { token: Token; bondPct: number; migrated: boolean; size?: number }) {
  const [failed, setFailed] = useState(false);
  const [fetchedUri, setFetchedUri] = useState<string>(() => _imgCache.get(token.mint) ?? '');

  // After 1s without an imageUri, fetch from token info endpoint (once per mint)
  useEffect(() => {
    if (token.imageUri || fetchedUri || _imgCache.has(token.mint)) return;
    const timer = setTimeout(() => {
      fetch(`/api/terminal/token/${token.mint}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const uri: string = d?.icon || d?.imageUri || '';
          _imgCache.set(token.mint, uri);
          if (uri) setFetchedUri(uri);
        })
        .catch(() => { _imgCache.set(token.mint, ''); });
    }, 1000);
    return () => clearTimeout(timer);
  }, [token.mint, token.imageUri, fetchedUri]);

  // When SSE feed later provides the imageUri, clear any fetch error so it shows
  useEffect(() => {
    if (token.imageUri && failed) setFailed(false);
  }, [token.imageUri]);

  const color = colorFor(token.mint);
  const effectiveUri = token.imageUri || fetchedUri;
  const showImg = !!effectiveUri && !failed;
  const SIZE = size;
  const STROKE = 4;
  const GAP = STROKE + 3;
  const IMG = SIZE - GAP * 2;
  const RX = Math.round(SIZE * 0.18);
  const pct = migrated ? 100 : Math.max(0, Math.min(100, bondPct));
  const arcPct = pct > 0 && pct < 1 ? 1 : pct; // show at least 1% arc so tiny progress is visible
  const ringColor = migrated
    ? '#34d399'
    : pct >= 80 ? '#fb923c'
    : pct >= 60 ? '#facc15'
    : '#a78bfa';
  return (
    <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg className="absolute inset-0 pointer-events-none" width={SIZE} height={SIZE}>
        <rect
          x={STROKE / 2} y={STROKE / 2}
          width={SIZE - STROKE} height={SIZE - STROKE}
          rx={RX} ry={RX}
          stroke="rgba(255,255,255,0.18)" strokeWidth={STROKE} fill="none"
        />
        <rect
          x={STROKE / 2} y={STROKE / 2}
          width={SIZE - STROKE} height={SIZE - STROKE}
          rx={RX} ry={RX}
          stroke={ringColor} strokeWidth={STROKE} fill="none"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${arcPct} 100`}
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />
      </svg>
      <div
        className="absolute"
        style={{ width: IMG, height: IMG, left: GAP, top: GAP }}
      >
        {showImg ? (
          <img
            src={effectiveUri}
            alt={`${token.symbol} logo`}
            className="block w-full h-full rounded-xl object-cover"
            loading="eager"
            fetchPriority="high"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className={`w-full h-full rounded-xl ${color} flex items-center justify-center text-white font-bold`} style={{ fontSize: SIZE * 0.22 }}>
            {(token.symbol || token.name || '?').slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <div
        className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-black/70 border border-white/10 text-[9px] font-bold tabular-nums leading-none"
        style={{ color: ringColor }}
      >
        {migrated ? '✓' : pct === 0 ? '0%' : pct < 1 ? '<1%' : pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`}
      </div>
    </div>
  );
}
function fmtCount(n?: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const TABS: { id: FeedType; label: string; icon: any; sub: string }[] = [
  { id: 'new',        label: 'New',        icon: Sparkles,   sub: 'Just launched' },
  { id: 'bonding',    label: 'Bonding',    icon: Flame,      sub: 'Almost graduated' },
  { id: 'migrated',   label: 'Graduated',  icon: Rocket,     sub: 'On open market' },
  { id: 'trending',   label: 'Trending',   icon: TrendingUp, sub: 'Hot right now' },
  { id: 'signals',    label: 'Signals',    icon: Bell,       sub: 'SM buys & spikes' },
];

function ago(ts?: number) {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Forces a re-render every second so ago() stays live
function useTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
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

function readCachedToken(mint: string): Token | undefined {
  try {
    for (const tab of ['new', 'bonding', 'migrated'] as const) {
      const raw = localStorage.getItem(`terminal_feed_cache_${tab}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const found = (parsed?.tokens || []).find((t: any) => t?.mint === mint);
      if (found) return found as Token;
    }
  } catch {}
  return undefined;
}

function SocialIcons({ socials, mint }: { socials: { twitter?: string; website?: string; telegram?: string; discord?: string }; mint?: string }) {
  const items: { href: string; render: () => React.ReactNode; label: string }[] = [];
  if (socials.twitter) items.push({ href: socials.twitter, label: 'X', render: () => <SiX className="h-5 w-5" /> });
  if (socials.website) items.push({ href: socials.website, label: 'Website', render: () => <Globe className="h-5 w-5" /> });
  if (socials.telegram) items.push({ href: socials.telegram, label: 'Telegram', render: () => <SiTelegram className="h-5 w-5" /> });
  if (socials.discord) items.push({ href: socials.discord, label: 'Discord', render: () => <SiDiscord className="h-5 w-5" /> });
  if (mint) {
    items.push({
      href: `https://solscan.io/token/${mint}`,
      label: 'Solscan',
      render: () => <img src="https://solscan.io/favicon.ico" alt="" className="h-5 w-5 rounded" />,
    });
    items.push({
      href: `https://dexscreener.com/solana/${mint}`,
      label: 'DexScreener',
      render: () => <img src="https://dexscreener.com/favicon.png" alt="" className="h-5 w-5 rounded" />,
    });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-2">
      {items.map((it) => (
        <a
          key={it.label}
          href={it.href}
          target="_blank"
          rel="noreferrer"
          aria-label={it.label}
          className="text-white/70 hover:text-white p-1.5 rounded-md hover:bg-white/10 inline-flex items-center"
          data-testid={`link-social-${it.label.toLowerCase()}`}
        >
          {it.render()}
        </a>
      ))}
    </div>
  );
}

function relAge(input: string | number | Date | undefined): string {
  if (!input) return '';
  const t = typeof input === 'number' ? input : new Date(input).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Terminal</h1>
              <Link href="/leaderboard">
                <a className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[11px] font-semibold hover:bg-yellow-500/25 transition">
                  🏆 Leaderboard
                </a>
              </Link>
            </div>
            <p className="text-white/60 text-xs">Live Solana launchpad screener · Pump.fun · LetsBonk · Meteora · Bags · Moonshot</p>
          </div>
        </div>
        <TerminalView />
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function HoldingsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { publicKey, setVisible } = useReownWallet();
  const [, navigate] = useLocation();
  const [portfolioTab, setPortfolioTab] = useState<'holdings' | 'activity'>('holdings');
  const addr = publicKey?.toBase58();

  const { data: holdingsData, isFetching: holdingsFetching } = useQuery<{ holdings: any[] }>({
    queryKey: ['/api/terminal/wallet/holdings', addr],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/wallet/${addr}/holdings`);
      if (!r.ok) throw new Error('holdings failed');
      return r.json();
    },
    enabled: open && !!addr && portfolioTab === 'holdings',
    refetchInterval: open ? 30_000 : false,
  });
  const { data: statsData } = useQuery<{ stats: any }>({
    queryKey: ['/api/terminal/wallet/stats', addr],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/wallet/${addr}/stats`);
      if (!r.ok) throw new Error('stats failed');
      return r.json();
    },
    enabled: open && !!addr,
    staleTime: 60_000,
  });
  const { data: activityData, isFetching: activityFetching } = useQuery<{ activity: any[] }>({
    queryKey: ['/api/terminal/wallet/activity', addr],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/wallet/${addr}/activity`);
      if (!r.ok) throw new Error('activity failed');
      return r.json();
    },
    enabled: open && !!addr && portfolioTab === 'activity',
    staleTime: 30_000,
  });

  const holdings = holdingsData?.holdings || [];
  const activity = activityData?.activity || [];
  const stats = statsData?.stats;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-gradient-to-b from-slate-900 via-purple-950 to-slate-900 border-purple-500/30 text-white w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">My Portfolio</SheetTitle>
        </SheetHeader>
        {!publicKey && (
          <div className="mt-6 text-center">
            <p className="text-white/70 text-sm mb-3">Connect your wallet to see portfolio.</p>
            <Button onClick={() => setVisible(true)} className="bg-purple-600 hover:bg-purple-700">Connect Wallet</Button>
          </div>
        )}
        {publicKey && (
          <div className="mt-4 space-y-3">
            {stats && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: '1D PnL', value: stats.profit1d, color: stats.profit1d >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: '7D PnL', value: stats.profit7d, color: stats.profit7d >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Win Rate', value: null, text: stats.winRate > 0 ? `${Math.round(stats.winRate * 100)}%` : '—', color: 'text-white' },
                ].map((s) => (
                  <div key={s.label} className="bg-purple-900/40 rounded-lg p-2 border border-purple-500/20">
                    <div className="text-white/50 text-[10px] uppercase tracking-wide">{s.label}</div>
                    <div className={`font-bold text-sm mt-0.5 ${s.color}`}>
                      {s.text ?? (s.value != null ? `${s.value >= 0 ? '+' : ''}${fmtUsd(s.value)}` : '—')}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setPortfolioTab('holdings')} className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition ${portfolioTab === 'holdings' ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/60'}`}>Holdings</button>
              <button onClick={() => setPortfolioTab('activity')} className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition ${portfolioTab === 'activity' ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/60'}`}>Activity</button>
            </div>

            {portfolioTab === 'holdings' && (
              <div className="space-y-2">
                {holdingsFetching && holdings.length === 0 && <div className="text-white/50 text-sm text-center py-6">Loading…</div>}
                {holdings.map((t: any) => {
                  const SOL_MINT = 'So11111111111111111111111111111111111111112';
                  const isSol = t.mint === SOL_MINT;
                  const fmtBal = (n: number) => n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n >= 1 ? n.toFixed(4) : n.toFixed(6);
                  return (
                    <button
                      key={t.mint}
                      onClick={() => { if (!isSol) { onOpenChange(false); navigate(`/terminal/token/${t.mint}`); } }}
                      className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-purple-900/30 border border-purple-500/20 transition text-left ${isSol ? 'cursor-default' : 'hover:bg-purple-800/40 cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {t.imageUri ? (
                          <img src={t.imageUri} alt="" className="w-9 h-9 rounded-full bg-black/30 object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-purple-700/50 flex items-center justify-center text-xs font-bold shrink-0">{(t.symbol || '?').slice(0, 2).toUpperCase()}</div>
                        )}
                        <div className="min-w-0">
                          <div className="text-white font-semibold text-sm truncate">{t.symbol || shortMint(t.mint)}</div>
                          <div className="text-white/50 text-xs tabular-nums">{fmtBal(t.balance ?? 0)} {t.symbol}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-white font-semibold text-sm tabular-nums">{fmtUsd(t.usdValue)}</div>
                        {t.unrealizedProfit != null && t.unrealizedProfit !== 0 && (
                          <div className={`text-xs font-semibold ${t.unrealizedProfit > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.unrealizedProfit > 0 ? '+' : ''}{fmtUsd(t.unrealizedProfit)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {portfolioTab === 'activity' && (
              <div className="space-y-2">
                {activityFetching && activity.length === 0 && <div className="text-white/50 text-sm text-center py-6">Loading…</div>}
                {!activityFetching && activity.length === 0 && <div className="text-white/50 text-sm text-center py-6">No recent activity.</div>}
                {activity.map((a, i) => (
                  <div key={`${a.signature}-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-purple-900/30 border border-purple-500/20">
                    <div className={`text-xs font-bold px-2 py-1 rounded ${a.type === 'buy' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                      {a.type?.toUpperCase() || 'TX'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-semibold truncate">{a.symbol || shortMint(a.mint)}</div>
                      <div className="text-white/50 text-xs">{ago(a.timestamp)} · {fmtUsd(a.usdValue)}</div>
                    </div>
                    {a.signature && (
                      <a href={`https://solscan.io/tx/${a.signature}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-white/30 hover:text-white">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

type MetricFilters = {
  mcapMin: string; mcapMax: string;
  liqMin: string; liqMax: string;
  volMin: string; volMax: string;
  bcurveMin: string; bcurveMax: string;
  ageMin: string; ageMax: string;
  buysMin: string; buysMax: string;
  sellsMin: string; sellsMax: string;
  txnsMin: string; txnsMax: string;
  smartMin: string; smartMax: string;
  kolsMin: string; kolsMax: string;
  holderMin: string; holderMax: string;
  rugMin: string; rugMax: string;
  botMin: string; botMax: string;
  bundlerMin: string; bundlerMax: string;
};

const EMPTY_FILTERS: MetricFilters = {
  mcapMin: '', mcapMax: '', liqMin: '', liqMax: '', volMin: '', volMax: '',
  bcurveMin: '', bcurveMax: '', ageMin: '', ageMax: '',
  buysMin: '', buysMax: '', sellsMin: '', sellsMax: '', txnsMin: '', txnsMax: '',
  smartMin: '', smartMax: '', kolsMin: '', kolsMax: '',
  holderMin: '', holderMax: '',
  rugMin: '', rugMax: '', botMin: '', botMax: '', bundlerMin: '', bundlerMax: '',
};

function hasActiveFilters(f: MetricFilters) {
  return Object.values(f).some(v => v !== '');
}

function applyMetricFilters(list: Token[], f: MetricFilters): Token[] {
  const now = Date.now();
  return list.filter(t => {
    const n = (s: string) => s === '' ? undefined : Number(s);
    if (n(f.mcapMin) != null && (t.marketCapUsd ?? 0) < (n(f.mcapMin)! * 1000)) return false;
    if (n(f.mcapMax) != null && (t.marketCapUsd ?? 0) > (n(f.mcapMax)! * 1000)) return false;
    if (n(f.liqMin) != null && (t.liquidityUsd ?? 0) < (n(f.liqMin)! * 1000)) return false;
    if (n(f.liqMax) != null && (t.liquidityUsd ?? 0) > (n(f.liqMax)! * 1000)) return false;
    if (n(f.volMin) != null && (t.volumeUsd ?? 0) < (n(f.volMin)! * 1000)) return false;
    if (n(f.volMax) != null && (t.volumeUsd ?? 0) > (n(f.volMax)! * 1000)) return false;
    if (n(f.bcurveMin) != null && (t.bondingPct ?? 0) < n(f.bcurveMin)!) return false;
    if (n(f.bcurveMax) != null && (t.bondingPct ?? 0) > n(f.bcurveMax)!) return false;
    if (t.createdAt) {
      const ageMin = (now - t.createdAt) / 60000;
      if (n(f.ageMin) != null && ageMin < n(f.ageMin)!) return false;
      if (n(f.ageMax) != null && ageMin > n(f.ageMax)!) return false;
    }
    if (n(f.buysMin) != null && (t.buys ?? 0) < n(f.buysMin)!) return false;
    if (n(f.buysMax) != null && (t.buys ?? 0) > n(f.buysMax)!) return false;
    if (n(f.sellsMin) != null && (t.sells ?? 0) < n(f.sellsMin)!) return false;
    if (n(f.sellsMax) != null && (t.sells ?? 0) > n(f.sellsMax)!) return false;
    if (n(f.txnsMin) != null && (t.txns ?? 0) < n(f.txnsMin)!) return false;
    if (n(f.txnsMax) != null && (t.txns ?? 0) > n(f.txnsMax)!) return false;
    if (n(f.smartMin) != null && (t.smartDegens ?? 0) < n(f.smartMin)!) return false;
    if (n(f.smartMax) != null && (t.smartDegens ?? 0) > n(f.smartMax)!) return false;
    if (n(f.kolsMin) != null && (t.renownedCount ?? 0) < n(f.kolsMin)!) return false;
    if (n(f.kolsMax) != null && (t.renownedCount ?? 0) > n(f.kolsMax)!) return false;
    if (n(f.rugMin) != null && ((t.rugRatio ?? 0) * 100) < n(f.rugMin)!) return false;
    if (n(f.rugMax) != null && ((t.rugRatio ?? 0) * 100) > n(f.rugMax)!) return false;
    if (n(f.botMin) != null && ((t.ratTraderRate ?? 0) * 100) < n(f.botMin)!) return false;
    if (n(f.botMax) != null && ((t.ratTraderRate ?? 0) * 100) > n(f.botMax)!) return false;
    if (n(f.bundlerMin) != null && ((t.bundlerRate ?? 0) * 100) < n(f.bundlerMin)!) return false;
    if (n(f.bundlerMax) != null && ((t.bundlerRate ?? 0) * 100) > n(f.bundlerMax)!) return false;
    return true;
  });
}

function buildServerFilterParams(f: MetricFilters, type: string): string | null {
  const p = new URLSearchParams({ type });
  const add = (key: string, val: string, multiplier = 1) => {
    if (val !== '') p.set(key, String(Number(val) * multiplier));
  };
  add('minLiquidity', f.liqMin, 1000);
  add('maxLiquidity', f.liqMax, 1000);
  add('minVolume', f.volMin, 1000);
  add('maxVolume', f.volMax, 1000);
  add('minBuys', f.buysMin);
  add('maxBuys', f.buysMax);
  add('minSells', f.sellsMin);
  add('maxSells', f.sellsMax);
  add('minTxns', f.txnsMin);
  add('maxTxns', f.txnsMax);
  add('minSmartMoney', f.smartMin);
  add('maxSmartMoney', f.smartMax);
  add('minKols', f.kolsMin);
  add('maxKols', f.kolsMax);
  add('minHolders', f.holderMin);
  add('maxHolders', f.holderMax);
  add('minRugRatio', f.rugMin);
  add('maxRugRatio', f.rugMax);
  if ([...p.entries()].some(([k]) => k !== 'type')) return p.toString();
  return null;
}

function FilterRow({ label, unit, minVal, maxVal, onMinChange, onMaxChange }: {
  label: string; unit?: string;
  minVal: string; maxVal: string;
  onMinChange: (v: string) => void; onMaxChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-white/5">
      <span className="text-white/60 text-[12px] w-[110px] shrink-0">{label}</span>
      <div className="flex gap-1.5 flex-1">
        <div className="relative flex-1">
          <input
            type="text" inputMode="decimal" placeholder="Min"
            value={minVal}
            onChange={e => onMinChange(e.target.value)}
            className="w-full bg-[#2a2a2a] border-0 ring-1 ring-white/10 rounded-md text-white text-[12px] px-2 py-1.5 outline-none focus:ring-purple-500/60 placeholder:text-white/20"
            style={unit ? { paddingRight: unit.length > 2 ? '2.5rem' : '1.8rem' } : {}}
          />
          {unit && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 text-[10px] pointer-events-none">{unit}</span>}
        </div>
        <div className="relative flex-1">
          <input
            type="text" inputMode="decimal" placeholder="Max"
            value={maxVal}
            onChange={e => onMaxChange(e.target.value)}
            className="w-full bg-[#2a2a2a] border-0 ring-1 ring-white/10 rounded-md text-white text-[12px] px-2 py-1.5 outline-none focus:ring-purple-500/60 placeholder:text-white/20"
            style={unit ? { paddingRight: unit.length > 2 ? '2.5rem' : '1.8rem' } : {}}
          />
          {unit && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 text-[10px] pointer-events-none">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

function MetricFilterDrawer({ open, onOpenChange, applied, onApply }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  applied: MetricFilters; onApply: (f: MetricFilters) => void;
}) {
  const [draft, setDraft] = useState<MetricFilters>(applied);
  useEffect(() => { if (open) setDraft(applied); }, [open]);
  const upd = (k: keyof MetricFilters) => (v: string) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[320px] sm:w-[360px] bg-[#141414] border-l border-white/10 p-0 overflow-y-auto">
        <div className="sticky top-0 bg-[#141414] z-10 flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-purple-400" />
            <span className="text-white font-semibold text-sm">Metrics Filter</span>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-white/40 hover:text-white/80 transition">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-2">
          <p className="text-white/30 text-[11px] mb-3">Filter by token metrics. Values in <span className="text-white/50">K</span> = thousands USD.</p>

          <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1 mt-3">Market</div>
          <FilterRow label="MKT Cap" unit="K" minVal={draft.mcapMin} maxVal={draft.mcapMax} onMinChange={upd('mcapMin')} onMaxChange={upd('mcapMax')} />
          <FilterRow label="Liquidity" unit="K" minVal={draft.liqMin} maxVal={draft.liqMax} onMinChange={upd('liqMin')} onMaxChange={upd('liqMax')} />
          <FilterRow label="Volume" unit="K" minVal={draft.volMin} maxVal={draft.volMax} onMinChange={upd('volMin')} onMaxChange={upd('volMax')} />
          <FilterRow label="B. Curve" unit="%" minVal={draft.bcurveMin} maxVal={draft.bcurveMax} onMinChange={upd('bcurveMin')} onMaxChange={upd('bcurveMax')} />
          <FilterRow label="Age" unit="min" minVal={draft.ageMin} maxVal={draft.ageMax} onMinChange={upd('ageMin')} onMaxChange={upd('ageMax')} />

          <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1 mt-4">Trading</div>
          <FilterRow label="Buys" minVal={draft.buysMin} maxVal={draft.buysMax} onMinChange={upd('buysMin')} onMaxChange={upd('buysMax')} />
          <FilterRow label="Sells" minVal={draft.sellsMin} maxVal={draft.sellsMax} onMinChange={upd('sellsMin')} onMaxChange={upd('sellsMax')} />
          <FilterRow label="TXs" minVal={draft.txnsMin} maxVal={draft.txnsMax} onMinChange={upd('txnsMin')} onMaxChange={upd('txnsMax')} />

          <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1 mt-4">Holders</div>
          <FilterRow label="Smart Money" minVal={draft.smartMin} maxVal={draft.smartMax} onMinChange={upd('smartMin')} onMaxChange={upd('smartMax')} />
          <FilterRow label="KOLs" minVal={draft.kolsMin} maxVal={draft.kolsMax} onMinChange={upd('kolsMin')} onMaxChange={upd('kolsMax')} />
          <FilterRow label="Holders" minVal={draft.holderMin} maxVal={draft.holderMax} onMinChange={upd('holderMin')} onMaxChange={upd('holderMax')} />

          <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1 mt-4">Risk</div>
          <FilterRow label="Rug %" unit="%" minVal={draft.rugMin} maxVal={draft.rugMax} onMinChange={upd('rugMin')} onMaxChange={upd('rugMax')} />
          <FilterRow label="Bot Trader %" unit="%" minVal={draft.botMin} maxVal={draft.botMax} onMinChange={upd('botMin')} onMaxChange={upd('botMax')} />
          <FilterRow label="Bundlers %" unit="%" minVal={draft.bundlerMin} maxVal={draft.bundlerMax} onMinChange={upd('bundlerMin')} onMaxChange={upd('bundlerMax')} />
        </div>

        <div className="sticky bottom-0 bg-[#141414] px-4 py-3 border-t border-white/10 flex gap-2 mt-2">
          <button
            onClick={() => { setDraft(EMPTY_FILTERS); onApply(EMPTY_FILTERS); }}
            className="flex-1 py-2 rounded-lg border border-white/15 text-white/50 text-sm hover:text-white/80 hover:border-white/30 transition"
          >
            Reset
          </button>
          <button
            onClick={() => { onApply(draft); onOpenChange(false); }}
            className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition"
          >
            Apply
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function TerminalView() {
  const [tab, setTab] = useState<FeedType>('new');
  const [search, setSearch] = useState('');
  const [trendingInterval, setTrendingInterval] = useState<'5m' | '1h' | '6h' | '24h'>('1h');
  const [trendingCategory, setTrendingCategory] = useState<'toptrending' | 'toptraded'>('toptrending');
  const [launchpadFilter, setLaunchpadFilter] = useState<Set<string>>(new Set()); // empty = show all
  const [metricFilters, setMetricFilters] = useState<MetricFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [tradeFor, setTradeFor] = useState<{ token: Token; action: 'buy' | 'sell' } | null>(null);
  const [, navigate] = useLocation();
  const { publicKey: walletKey, setVisible: openWallet, disconnect: disconnectWallet, connected: isWalletConnected, select: selectWallet } = useReownWallet();
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  useTick(); // re-render every second so ago() timestamps stay live

  // Live feed via SSE — server pushes updates every 5 seconds
  const [liveData, setLiveData] = useState<{ new: Token[]; bonding: Token[]; migrated: Token[]; trending: Token[]; status: any } | null>(() => {
    try {
      const raw = localStorage.getItem('terminal_sse_cache');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  useEffect(() => {
    const es = new EventSource('/api/terminal/stream');
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        setLiveData(d);
        try { localStorage.setItem('terminal_sse_cache', e.data); } catch {}
      } catch {}
    };
    es.onerror = () => { /* SSE auto-reconnects */ };
    return () => es.close();
  }, []);

  const isSpecialTab = tab === 'signals';
  const isFetching = !liveData;

  const debouncedSearch = useDebounced(search.trim(), 300);
  const { data: searchData, isFetching: searchFetching } = useQuery<{ tokens: Token[] }>({
    queryKey: ['/api/terminal/search', debouncedSearch],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/search?q=${encodeURIComponent(debouncedSearch)}`);
      if (!r.ok) throw new Error('search failed');
      return r.json();
    },
    enabled: debouncedSearch.length > 0,
    staleTime: 15_000,
  });

  const isGmgnTab = tab === 'new' || tab === 'bonding' || tab === 'migrated';
  const serverFilterParams = isGmgnTab && hasActiveFilters(metricFilters) && debouncedSearch.length === 0
    ? buildServerFilterParams(metricFilters, tab)
    : null;

  const { data: filteredData, isFetching: filteredFetching } = useQuery<{ tokens: Token[] }>({
    queryKey: ['/api/terminal/filtered', serverFilterParams],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/filtered?${serverFilterParams}`);
      if (!r.ok) throw new Error('filter failed');
      return r.json();
    },
    enabled: serverFilterParams !== null,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: jupTrendingData, isFetching: jupTrendingFetching } = useQuery<{ tokens: Token[] }>({
    queryKey: ['/api/terminal/jup-trending', trendingInterval, trendingCategory],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/jup-trending?interval=${trendingInterval}&category=${trendingCategory}&limit=50`);
      if (!r.ok) throw new Error('jup-trending failed');
      return r.json();
    },
    enabled: tab === 'trending',
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const tokens = useMemo(() => {
    let list: Token[] = [];
    if (debouncedSearch.length > 0) list = searchData?.tokens ?? [];
    else if (serverFilterParams !== null) list = filteredData?.tokens ?? [];
    else if (tab === 'trending') list = jupTrendingData?.tokens ?? [];
    else if (!liveData) list = [];
    else if (tab === 'new') list = liveData.new;
    else if (tab === 'bonding') list = liveData.bonding;
    else if (tab === 'migrated') list = liveData.migrated;

    if (launchpadFilter.size > 0 && isGmgnTab && debouncedSearch.length === 0) {
      list = list.filter(t => {
        const lp = (t.launchpad || '').toLowerCase();
        if (launchpadFilter.has('pump') && (lp.includes('pump') || lp === 'pump.fun')) return true;
        if (launchpadFilter.has('letsbonk') && lp.includes('letsbonk')) return true;
        if (launchpadFilter.has('meteora') && lp.includes('meteora')) return true;
        if (launchpadFilter.has('moonshot') && lp.includes('moonshot')) return true;
        if (launchpadFilter.has('bags') && lp.includes('bag')) return true;
        if (launchpadFilter.has('raydium') && lp.includes('ray')) return true;
        if (launchpadFilter.has('believe') && lp.includes('believe')) return true;
        if (launchpadFilter.has('boop') && lp.includes('boop')) return true;
        if (launchpadFilter.has('bankr') && lp.includes('bankr')) return true;
        if (launchpadFilter.has('bonkers') && lp.includes('bonker')) return true;
        if (launchpadFilter.has('memoo') && lp.includes('memoo')) return true;
        if (launchpadFilter.has('zora') && lp.includes('zora')) return true;
        if (launchpadFilter.has('surge') && lp.includes('surge')) return true;
        if (launchpadFilter.has('token_mill') && lp.includes('token_mill')) return true;
        return false;
      });
    }
    // Client-side fallback for fields not supported server-side (mcap, bcurve, age, bot, bundler)
    if (hasActiveFilters(metricFilters) && isGmgnTab && serverFilterParams === null) {
      list = applyMetricFilters(list, metricFilters);
    }
    return list;
  }, [liveData, tab, searchData, debouncedSearch, jupTrendingData, launchpadFilter, metricFilters, filteredData, serverFilterParams, isGmgnTab]);

  const status = liveData?.status;

  return (
    <div className="text-white">
      <HoldingsDrawer open={holdingsOpen} onOpenChange={setHoldingsOpen} />
      <MetricFilterDrawer open={filterOpen} onOpenChange={setFilterOpen} applied={metricFilters} onApply={setMetricFilters} />
      <div>
        <div className="flex items-center justify-end gap-2 mb-4">
          {isWalletConnected && walletKey ? (
            <div className="relative">
              <button
                onClick={() => setWalletMenuOpen(o => !o)}
                className="bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white font-mono text-sm border border-purple-500/30 outline-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                data-testid="button-wallet-connected"
              >
                {walletKey.toString().slice(0, 6)}...{walletKey.toString().slice(-6)}
              </button>
              {walletMenuOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setWalletMenuOpen(false)} />
              )}
              {walletMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-purple-500/30 rounded-md shadow-lg overflow-hidden min-w-full">
                  <div
                    onClick={() => { setWalletMenuOpen(false); setHoldingsOpen(true); }}
                    className="px-3 py-2 text-white hover:bg-purple-600/40 cursor-pointer text-sm text-center truncate"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    data-testid="button-portfolio"
                  >
                    Portfolio
                  </div>
                  <div
                    onClick={() => { disconnectWallet(); setWalletMenuOpen(false); }}
                    className="px-3 py-2 text-white hover:bg-purple-600/40 cursor-pointer text-sm text-center truncate"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    data-testid="button-disconnect"
                  >
                    Disconnect
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button
              onClick={() => { selectWallet(null); openWallet(true); }}
              className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30 h-auto"
              title="Connect your wallet"
              data-testid="button-connect-wallet"
            >
              Connect Wallet
            </Button>
          )}
          <span className={`text-[10px] px-2 py-1 rounded-full border ${
            status?.connected ? 'border-green-500/40 text-green-300 bg-green-500/10'
                              : 'border-yellow-500/40 text-yellow-300 bg-yellow-500/10'
          }`}>
            {status?.connected ? 'LIVE' : 'CONNECTING…'}
          </span>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
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
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter symbol, name or mint…"
              className="pl-9 bg-black/30 border-white/10 text-white placeholder:text-white/30"
              data-testid="input-search"
            />
          </div>
          {isGmgnTab && (
            <button
              onClick={() => setFilterOpen(true)}
              className={`flex items-center gap-1.5 px-3 rounded-lg border text-sm transition shrink-0 ${
                hasActiveFilters(metricFilters)
                  ? 'bg-purple-600/30 border-purple-400/60 text-purple-300'
                  : 'bg-black/30 border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters(metricFilters) && (
                <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
              )}
            </button>
          )}
        </div>

        {isGmgnTab && debouncedSearch.length === 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/50 text-[11px] font-semibold uppercase tracking-wider">Launchpads</span>
              {launchpadFilter.size > 0 && (
                <button onClick={() => setLaunchpadFilter(new Set())} className="text-[11px] px-2 py-0.5 rounded border border-white/20 text-white/50 hover:text-white/70 transition">
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: 'pump',     label: 'Pump.fun',  color: '#88D693' },
                { id: 'letsbonk', label: 'LetsBonk',  color: '#E78C19' },
                { id: 'meteora',  label: 'Meteora',   color: '#07E993' },
                { id: 'moonshot', label: 'Moonshot',  color: '#FF88FE' },
                { id: 'bags',     label: 'Bags',      color: '#00D62B' },
                { id: 'raydium',  label: 'Raydium',   color: '#9945FF' },
                { id: 'believe',  label: 'Believe',   color: '#3B82F6' },
                { id: 'boop',     label: 'Boop',      color: '#F59E0B' },
                { id: 'bankr',    label: 'Bankr',     color: '#EC4899' },
                { id: 'bonkers',  label: 'Bonkers',   color: '#F97316' },
                { id: 'memoo',    label: 'Memoo',     color: '#A78BFA' },
                { id: 'zora',     label: 'Zora',      color: '#60A5FA' },
                { id: 'surge',    label: 'Surge',     color: '#34D399' },
                { id: 'token_mill', label: 'TokenMill', color: '#FB7185' },
              ] as const).map(lp => {
                const active = launchpadFilter.size === 0 || launchpadFilter.has(lp.id);
                return (
                  <button
                    key={lp.id}
                    onClick={() => setLaunchpadFilter(prev => {
                      const next = new Set(prev);
                      if (next.has(lp.id)) next.delete(lp.id); else next.add(lp.id);
                      return next;
                    })}
                    className="inline-flex items-center gap-1 px-1.5 h-[22px] rounded-2xl text-[11px] cursor-pointer select-none transition-all w-fit"
                    style={active ? {
                      border: `1px solid ${lp.color}99`,
                      color: lp.color,
                      backgroundColor: `${lp.color}1a`,
                    } : {
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: active ? lp.color : 'rgba(255,255,255,0.2)' }} />
                    {lp.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'signals' && <SignalsView />}

        {tab === 'trending' && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex gap-1">
              {(['5m', '1h', '6h', '24h'] as const).map(iv => (
                <button key={iv} onClick={() => setTrendingInterval(iv)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition font-semibold ${trendingInterval === iv ? 'bg-purple-600 border-purple-500 text-white' : 'border-white/20 text-white/50 hover:text-white/80'}`}>
                  {iv}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex gap-1">
              {([['toptrending', 'Trending'], ['toptraded', 'Top Traded']] as const).map(([cat, label]) => (
                <button key={cat} onClick={() => setTrendingCategory(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition font-semibold ${trendingCategory === cat ? 'bg-purple-600 border-purple-500 text-white' : 'border-white/20 text-white/50 hover:text-white/80'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isSpecialTab && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto no-scrollbar">
          {tokens.length === 0 && (
            <div className="px-4 py-16 text-center text-white/50 text-sm bg-purple-900/20 border border-white/10 rounded-2xl">
              {tab === 'trending' ? (jupTrendingFetching ? 'Loading Jupiter trending…' : 'No trending tokens found.') : (isFetching ? 'Loading feed…' : 'No tokens yet — waiting for stream events.')}
            </div>
          )}
          {tokens.map((t) => {
            const totalTx = (t.buys ?? 0) + (t.sells ?? 0);
            const pct = t.pctChange;
            const pctUp = (pct ?? 0) >= 0;
            const bondPct = Math.min(100, parseFloat(((t.bondingPct ?? 0) * 100).toFixed(1)));
            const isMigrated = tab === 'migrated' || !!t.migrated || (t.bondingPct ?? 0) >= 1;
            const cardPrice = t.priceUsd;
            const cardMcap = t.marketCapUsd;
            const cardVolume = t.volumeUsd;
            const cardLiquidity = t.liquidityUsd;
            const cardTxns = totalTx || t.txns || null;
            return (
              <div
                key={t.mint}
                onClick={() => navigate(`/terminal/token/${t.mint}`)}
                className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-4 hover:border-purple-500/40 transition-all cursor-pointer overflow-hidden active:scale-[0.98] font-bold"
                data-testid={`row-${t.mint}`}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <TokenAvatar token={t} bondPct={bondPct} migrated={isMigrated} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white text-base truncate">{t.name || t.symbol || 'Unknown'}</span>
                      </div>
                      <div className="text-sm truncate flex items-center gap-2">
                        <span className="text-white">{t.symbol || shortMint(t.mint)}</span>
                        {t.createdAt && (
                          <span className="text-green-400 font-bold tabular-nums">{ago(t.createdAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-white text-base tabular-nums">{fmtPriceUsd(cardPrice)}</div>
                    {pct != null && Number.isFinite(pct) && (
                      <div className={`text-right text-sm font-medium ${pctUp ? 'text-green-400' : 'text-red-400'}`}>
                        {pctUp ? '+' : ''}{(pct ?? 0).toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <div className="text-white">Market Cap</div>
                    <div className="text-white font-medium tabular-nums">{fmtUsd(cardMcap)}</div>
                  </div>
                  <div>
                    <div className="text-white">Volume</div>
                    <div className="text-white font-medium tabular-nums">{fmtUsd(cardVolume)}</div>
                  </div>
                  <div>
                    <div className="text-white">Liquidity</div>
                    <div className="text-white font-medium tabular-nums">{fmtUsd(cardLiquidity)}</div>
                  </div>
                  <div>
                    <div className="text-white">Txns</div>
                    <div className="text-white font-medium tabular-nums">{cardTxns != null ? fmtCount(cardTxns) : '—'}</div>
                  </div>
                </div>
                {/* Badges */}
                {((t.smartDegens ?? 0) > 0 || (t.rugRatio ?? 0) > 0.3) && (
                  <div className="flex flex-wrap gap-1.5">
                    {(t.smartDegens ?? 0) > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold">
                        {t.smartDegens} SM
                      </span>
                    )}
                    {(t.renownedCount ?? 0) > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 font-semibold">
                        {t.renownedCount} KOL
                      </span>
                    )}
                    {(t.rugRatio ?? 0) > 0.3 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 font-semibold">
                        RUG {Math.round((t.rugRatio ?? 0) * 100)}%
                      </span>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </div>}

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

const SIGNAL_COLORS: Record<number, string> = {
  6: 'bg-orange-500/20 border-orange-500/40 text-orange-300',
  7: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
  8: 'bg-blue-500/20 border-blue-500/40 text-blue-300',
  11: 'bg-pink-500/20 border-pink-500/40 text-pink-300',
  12: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  13: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
};

function SignalsView() {
  const [, navigate] = useLocation();
  const { data, isFetching } = useQuery<{ signals: any[] }>({
    queryKey: ['/api/terminal/signals'],
    queryFn: async () => {
      const r = await fetch('/api/terminal/signals');
      if (!r.ok) throw new Error('signals failed');
      return r.json();
    },
    refetchInterval: 30000,
  });
  const signals = data?.signals || [];
  return (
    <div className="max-h-[70vh] overflow-y-auto no-scrollbar space-y-2">
      {isFetching && signals.length === 0 && (
        <div className="text-center text-white/50 text-sm py-12">Loading signals…</div>
      )}
      {!isFetching && signals.length === 0 && (
        <div className="text-center text-white/50 text-sm py-12">No signals yet.</div>
      )}
      {signals.map((s, i) => {
        const color = SIGNAL_COLORS[s.signalType] || 'bg-purple-500/20 border-purple-500/40 text-purple-300';
        return (
          <div
            key={`${s.mint}-${s.triggerAt}-${i}`}
            onClick={() => navigate(`/terminal/token/${s.mint}`)}
            className="flex items-center gap-3 p-3 rounded-xl bg-purple-900/20 border border-purple-500/20 hover:border-purple-500/40 cursor-pointer transition-all"
          >
            {s.imageUri ? (
              <img src={s.imageUri} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-purple-700/50 flex-shrink-0 flex items-center justify-center text-xs font-bold">
                {(s.symbol || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white text-sm">{s.symbol || s.name || s.mint.slice(0, 8)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${color}`}>{s.label}</span>
                {s.times > 1 && <span className="text-[10px] text-white/40">×{s.times}</span>}
              </div>
              <div className="text-xs text-white/50 mt-0.5 flex gap-3">
                <span>MCap {fmtUsd(s.currentMcap)}</span>
                {s.liquidity > 0 && <span>Liq {fmtUsd(s.liquidity)}</span>}
                {s.holderCount > 0 && <span>{fmtCount(s.holderCount)} holders</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-white/40 text-xs">{ago(s.triggerAt)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type JupMint = {
  id: string; mint?: string; name?: string; symbol?: string; icon?: string;
  decimals?: number; twitter?: string; website?: string; telegram?: string; discord?: string; dev?: string;
  circSupply?: number; totalSupply?: number; holderCount?: number;
  fdv?: number; mcap?: number; usdPrice?: number; usdPrice_?: number; liquidity?: number;
  organicScore?: number; isVerified?: boolean;
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean; topHoldersPercentage?: number; devBalancePercentage?: number };
  stats5m?: { holderChange?: number;[k: string]: any }; stats1h?: { holderChange?: number;[k: string]: any }; stats6h?: { holderChange?: number;[k: string]: any }; stats24h?: { holderChange?: number;[k: string]: any };
  firstPool?: { id?: string; createdAt?: string; launchpad?: string };
  launchpad?: string; graduatedPool?: string;
  socials?: { twitter?: string; website?: string; telegram?: string; discord?: string };
  metadata?: { extensions?: { twitter?: string; website?: string; telegram?: string; discord?: string } };
  // GMGN fields
  smartDegens?: number; renownedWallets?: number; rugRatio?: number;
  ratTraderRate?: number; bundlerRate?: number; bondingProgress?: number;
};

function pickSocials(info?: JupMint): { twitter?: string; website?: string; telegram?: string; discord?: string } {
  if (!info) return {};
  const ext = (info as any)?.metadata?.extensions || {};
  const s = (info as any)?.socials || {};
  return {
    twitter: info.twitter || s.twitter || ext.twitter,
    website: info.website || s.website || ext.website,
    telegram: info.telegram || s.telegram || ext.telegram,
    discord: info.discord || s.discord || ext.discord,
  };
}

function fmtNum(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

export function TokenPage() {
  const [, params] = useRoute('/terminal/token/:mint');
  const [, navigate] = useLocation();
  const { publicKey, setVisible } = useReownWallet();
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const mint = params?.mint || '';
  const shortAddr = publicKey ? `${publicKey.toString().slice(0, 4)}…${publicKey.toString().slice(-4)}` : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col overflow-x-hidden">
      <HoldingsDrawer open={holdingsOpen} onOpenChange={setHoldingsOpen} />
      <div className="container mx-auto max-w-4xl lg:max-w-7xl px-4 pt-3 pb-6 flex-1">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2" data-testid="link-home">
            <img src={logoImage} alt="Get your SOL back!" className="h-10 w-auto" />
          </button>
          <div className="flex items-center gap-2">
            {publicKey ? (
              <button
                onClick={() => setHoldingsOpen(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-purple-600/30 border border-purple-400/40 text-white hover:bg-purple-600/50 transition"
                data-testid="button-portfolio"
              >
                <WalletIcon className="h-4 w-4" />
                <span className="font-semibold">{shortAddr}</span>
              </button>
            ) : (
              <button
                onClick={() => setVisible(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-purple-600/30 border border-purple-400/40 text-white hover:bg-purple-600/50 transition"
                data-testid="button-portfolio"
              >
                <WalletIcon className="h-4 w-4" />
                <span className="font-semibold">Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
        <TokenContent mint={mint} onBack={() => navigate('/?tab=terminal')} />
      </div>
    </div>
  );
}

const RESOLUTIONS = [
  { label: '1M', value: '1m' },
  { label: '5M', value: '5m' },
  { label: '15M', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
];

// GMGN interval codes: 1m→1, 5m→5, 15m→15, 1h→60, 4h→240, 1d→1D
const GMGN_INTERVAL: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': '1D',
};

function PriceChart({ mint }: { mint: string }) {
  const [res, setRes] = useState('15m');
  const interval = GMGN_INTERVAL[res] || '15';
  const src = `https://www.gmgn.cc/kline/sol/${mint}?theme=dark&interval=${interval}`;

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 flex flex-col bg-black" style={{ height: 520 }}>
      {/* Resolution bar — mirrors GMGN intervals */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-white/5 shrink-0 bg-black">
        {RESOLUTIONS.map(r => (
          <button key={r.value} onClick={() => setRes(r.value)}
            className={`text-[11px] px-2.5 py-1 rounded font-medium transition-colors ${res === r.value ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white/70'}`}>
            {r.label}
          </button>
        ))}
      </div>
      <iframe
        key={src}
        src={src}
        className="flex-1 w-full border-0"
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}

export function TokenContent({ mint, onBack }: { mint: string; onBack?: () => void }) {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<'info' | 'security' | 'holders' | 'traders'>('info');
  const [tradeFor, setTradeFor] = useState<'buy' | 'sell' | null>(null);

  const { data: info, isLoading } = useQuery<JupMint>({
    queryKey: ['/api/terminal/token', mint],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/token/${mint}`);
      if (!r.ok) throw new Error('info failed');
      return r.json();
    },
    refetchInterval: 10_000,
    enabled: !!mint,
  });
  const { data: liveData } = useQuery<{ live: Token | null }>({
    queryKey: ['/api/terminal/token-live', mint],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/token-live/${mint}`);
      if (!r.ok) throw new Error('live failed');
      const j = await r.json();
      if (j?.live) return j;
      return { live: null };
    },
    refetchInterval: 15000,
    enabled: !!mint,
  });
  const { data: holdersData, isFetching: holdersLoading } = useQuery<{ holders: { address: string; owner?: string; amount: number; uiAmount?: number; pct?: number; label?: string; profit?: number }[] }>({
    queryKey: ['/api/terminal/holders', mint],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/holders/${mint}`);
      if (!r.ok) throw new Error('holders failed');
      return r.json();
    },
    enabled: tab === 'holders' && !!mint,
    staleTime: 60_000,
  });
  const { data: tradersData, isFetching: tradersLoading } = useQuery<{ traders: any[] }>({
    queryKey: ['/api/terminal/traders', mint],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/traders/${mint}`);
      if (!r.ok) throw new Error('traders failed');
      return r.json();
    },
    enabled: tab === 'traders' && !!mint,
    staleTime: 60_000,
  });

  const { data: jupMarket } = useQuery<any>({
    queryKey: ['/api/terminal/jup-market', mint],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/jup-market/${mint}`);
      if (!r.ok) throw new Error('jup-market failed');
      return r.json();
    },
    enabled: !!mint,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  // Live price — polls Jupiter Price v3 every 3 seconds
  const { data: jupLivePrice } = useQuery<{ price: number | null; confidence: string | null }>({
    queryKey: ['/api/terminal/jup-price', mint],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/jup-price/${mint}`);
      if (!r.ok) throw new Error('jup-price failed');
      return r.json();
    },
    enabled: !!mint,
    refetchInterval: 3_000,
    staleTime: 2_000,
  });

  const s24 = info?.stats24h || {};
  const pct24 = typeof s24.priceChange === 'number' ? s24.priceChange : undefined;
  const pctUp = (pct24 ?? 0) >= 0;
  const totalSupply = info?.totalSupply ?? info?.circSupply ?? 0;
  const liveT: any = liveData?.live || {};
  // Live price (3s) takes priority over full market data (30s) and GMGN fallback
  const jupPrice = jupLivePrice?.price ?? jupMarket?.price ?? null;
  const priceUsd = jupPrice ?? liveT.priceUsd ?? (info as any)?.usdPrice;
  const tokenForTrade: Token = {
    mint,
    name: info?.name,
    symbol: info?.symbol,
    imageUri: info?.icon,
    priceUsd,
    marketCapSol: liveT.marketCapSol,
    priceSol: liveT.priceSol,
    pool: liveT.pool,
  } as any;
  const [mobileSwapOpen, setMobileSwapOpen] = useState(false);

  return (
    <div className="text-white">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => onBack ? onBack() : navigate('/?tab=terminal')} className="text-white/70 hover:text-white" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>

        {isLoading && !info && (
          <div className="text-center text-white/50 py-16">Loading token…</div>
        )}

        <div className="flex flex-col lg:flex-row lg:gap-4">
          {/* LEFT: chart + tabs + tab content — order-2 on mobile (shows below token card) */}
          <div className="order-2 lg:order-1 flex-1 min-w-0 space-y-3">
            <PriceChart mint={mint} />

            <div className="flex gap-2 flex-wrap">
              {(['info', 'security', 'holders', 'traders'] as const).map((id) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-4 py-2 rounded-lg text-sm capitalize ${tab === id ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                  data-testid={`detail-tab-${id}`}
                >{id}</button>
              ))}
            </div>

            {tab === 'info' && (() => {
              const launchpad = info?.firstPool?.launchpad || (info as any)?.launchpad;
              const devAddr = (info as any)?.devAddress || info?.dev || '';
              const poolAddr = (info as any)?.poolAddress || '';
              const poolDex = (info as any)?.poolDex || '';
              const poolLiq = (info as any)?.poolLiquidity;
              return (
                <div className="bg-purple-900/40 border border-purple-500/20 rounded-2xl overflow-hidden">
                  <InfoAddressRow label="Contract Address" value={mint} />
                  {devAddr && <InfoAddressRow label="Developer Wallet" value={devAddr} />}
                  {poolAddr && <InfoAddressRow label={`Pool (${poolDex || 'DEX'})`} value={poolAddr} />}
                  {poolLiq != null && <InfoTextRow label="Pool Liquidity" value={fmtUsd(poolLiq)} />}
                  {launchpad && <InfoTextRow label="Launchpad" value={launchpad} isLast />}
                </div>
              );
            })()}

            {tab === 'security' && (() => {
              const smartDegens = (info as any)?.smartDegens ?? 0;
              const renownedWallets = (info as any)?.renownedWallets ?? 0;
              const rugRatio = (info as any)?.rugRatio;
              const ratTraderRate = (info as any)?.ratTraderRate;
              const bundlerRate = (info as any)?.bundlerRate;
              const audit = (info as any)?.audit || {};
              const topHoldersPct = audit.topHoldersPercentage != null ? Number(audit.topHoldersPercentage) : null;
              const devBalPct = audit.devBalancePercentage != null ? Number(audit.devBalancePercentage) : null;
              return (
                <div className="space-y-3">
                  <div className="bg-purple-900/40 border border-purple-500/20 rounded-2xl overflow-hidden">
                    <div className="grid grid-cols-2 divide-x divide-y divide-purple-500/20">
                      {[
                        { label: 'Smart Wallets', value: smartDegens > 0 ? `${smartDegens} SM` : '0 SM', color: smartDegens >= 3 ? 'text-emerald-400' : smartDegens > 0 ? 'text-yellow-400' : 'text-white/50' },
                        { label: 'KOL Wallets', value: renownedWallets > 0 ? `${renownedWallets} KOL` : '0 KOL', color: renownedWallets > 0 ? 'text-blue-400' : 'text-white/50' },
                        { label: 'Rug Ratio', value: rugRatio != null ? `${(rugRatio * 100).toFixed(1)}%` : '—', color: rugRatio != null && rugRatio > 0.5 ? 'text-red-400' : rugRatio != null && rugRatio > 0.2 ? 'text-yellow-400' : 'text-emerald-400' },
                        { label: 'Rat Traders', value: ratTraderRate != null ? `${(ratTraderRate * 100).toFixed(1)}%` : '—', color: ratTraderRate != null && ratTraderRate > 0.3 ? 'text-red-400' : 'text-white/70' },
                      ].map((s) => (
                        <div key={s.label} className="px-3 py-2.5 text-center">
                          <div className="text-purple-300/70 text-[10px] font-semibold tracking-wider uppercase">{s.label}</div>
                          <div className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-purple-900/40 border border-purple-500/20 rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-purple-500/20">
                      <span className="text-purple-300/70 text-xs font-semibold tracking-wider uppercase">Smart Money & Security</span>
                    </div>
                    {[
                      { label: 'Mint Authority', value: audit.mintAuthorityDisabled ? '✓ Disabled' : '⚠ Active', color: audit.mintAuthorityDisabled ? 'text-emerald-400' : 'text-red-400' },
                      { label: 'Freeze Authority', value: audit.freezeAuthorityDisabled ? '✓ Disabled' : '⚠ Active', color: audit.freezeAuthorityDisabled ? 'text-emerald-400' : 'text-red-400' },
                      topHoldersPct != null ? { label: 'Top Holders', value: `${topHoldersPct.toFixed(1)}%`, color: topHoldersPct > 50 ? 'text-red-400' : topHoldersPct > 30 ? 'text-yellow-400' : 'text-emerald-400' } : null,
                      devBalPct != null ? { label: 'Dev Balance', value: `${devBalPct.toFixed(2)}%`, color: devBalPct > 5 ? 'text-red-400' : 'text-emerald-400' } : null,
                      bundlerRate != null ? { label: 'Bundler Rate', value: `${(bundlerRate * 100).toFixed(1)}%`, color: bundlerRate > 0.3 ? 'text-red-400' : 'text-white/70' } : null,
                    ].filter(Boolean).map((row: any) => (
                      <div key={row.label} className="flex items-center justify-between px-4 py-2 border-b border-purple-500/10 last:border-0">
                        <span className="text-white/60 text-xs">{row.label}</span>
                        <span className={`text-xs font-semibold ${row.color}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {tab === 'holders' && (
              <div className="bg-purple-900/40 rounded-2xl border border-purple-500/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold">Top holders</h3>
                  <a href={`https://app.bubblemaps.io/sol/token/${mint}`} target="_blank" rel="noreferrer"
                    className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/80 border border-white/10">Bubble map</a>
                </div>
                {holdersLoading && <div className="text-center text-white/50 text-sm py-6">Loading top holders…</div>}
                {!holdersLoading && (holdersData?.holders?.length ?? 0) === 0 && <div className="text-center text-white/50 text-sm py-6">No holders found.</div>}
                <div className="divide-y divide-white/5">
                  {(() => {
                    const devAddr = (info as any)?.devAddress || info?.dev || '';
                    const poolAddr = (info as any)?.poolAddress || '';
                    const poolLiq = (info as any)?.poolLiquidity;
                    const tagFor = (h: any) => {
                      const addr = h.address; const apiTags: string[] = h.tags || []; const label: string = h.label || '';
                      if (h.addrType === 2 || apiTags.includes('pump_amm') || apiTags.includes('raydium') || label === 'pump.fun-bonding-curve' || (label && label.startsWith('liquidity-pool:')) || (poolAddr && addr === poolAddr)) {
                        const dex = h.exchange || (info as any)?.poolDex || 'Pool'; const liqStr = poolLiq != null && addr === poolAddr ? ` · ${fmtUsd(poolLiq)}` : '';
                        return { name: `${dex}${liqStr}`, icon: Droplet, color: 'text-sky-400', bg: 'bg-sky-500/10' };
                      }
                      if (apiTags.includes('dev') || (devAddr && addr === devAddr)) return { name: 'Developer', icon: Hammer, color: 'text-amber-400', bg: 'bg-amber-500/10' };
                      return null;
                    };
                    return (holdersData?.holders || []).slice(0, 20).map((h: any) => {
                      const pct = h.pct != null ? h.pct * 100 : (totalSupply > 0 ? (h.amount / totalSupply) * 100 : 0);
                      const tag = tagFor(h); const apiTags: string[] = h.tags || []; const isSm = apiTags.includes('smart_degen'); const isKol = apiTags.includes('renowned');
                      return (
                        <a key={h.address} href={`https://gmgn.ai/sol/address/${h.address}`} target="_blank" rel="noreferrer"
                          className={`flex items-center justify-between py-2.5 text-sm hover:bg-white/5 px-2 -mx-2 rounded transition-colors ${tag?.bg || ''}`}>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {tag ? <div className="flex items-center gap-1.5"><tag.icon className={`h-3.5 w-3.5 ${tag.color} shrink-0`} /><span className={`text-xs font-semibold ${tag.color}`}>{tag.name}</span></div>
                              : <span className="font-mono text-xs text-purple-300 truncate">{h.name || shortMint(h.address)}</span>}
                            {isSm && <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">SM</span>}
                            {isKol && <span className="text-[9px] px-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">KOL</span>}
                          </div>
                          <div className="flex items-center gap-3 text-right">
                            {h.usdValue > 0 && <div className="text-xs text-white/50 tabular-nums">{fmtUsd(h.usdValue)}</div>}
                            <div className="text-white tabular-nums text-xs font-semibold">{pct.toFixed(2)}%</div>
                          </div>
                        </a>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {tab === 'traders' && (
              <div className="bg-purple-900/40 rounded-2xl border border-purple-500/20 overflow-hidden">
                {tradersLoading && <div className="text-center text-white/50 text-sm py-8">Loading…</div>}
                {!tradersLoading && (tradersData?.traders?.length ?? 0) === 0 && <div className="text-center text-white/50 text-sm py-8">No trades found.</div>}
                {(tradersData?.traders || []).length > 0 && (
                  <div className="overflow-x-auto">
                    <div className="grid text-[10px] text-purple-300/40 font-semibold tracking-wider uppercase px-3 py-2 border-b border-white/5"
                      style={{ gridTemplateColumns: '52px 44px 90px 100px 1fr 110px' }}>
                      <span>Time</span><span>Type</span><span>Value</span><span>Price</span><span>Amount</span><span>By</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {(tradersData?.traders || []).map((h: any) => {
                        const isBuy = h.lastTradeType !== 'sell';
                        const timeAgo = h.lastActive ? relAge(h.lastActive * 1000) : '—';
                        const value = h.lastTradeUsd > 0 ? fmtUsd(h.lastTradeUsd) : isBuy ? (h.buyCount > 0 ? fmtUsd(h.buyVolume / h.buyCount) : '—') : (h.sellCount > 0 ? fmtUsd(h.sellVolume / h.sellCount) : '—');
                        const price = h.lastTradePrice > 0 ? `$${h.lastTradePrice < 0.000001 ? h.lastTradePrice.toExponential(2) : h.lastTradePrice < 0.001 ? h.lastTradePrice.toFixed(7) : h.lastTradePrice < 1 ? h.lastTradePrice.toFixed(5) : h.lastTradePrice.toFixed(4)}` : isBuy ? (h.avgCost > 0 ? `$${h.avgCost.toFixed(h.avgCost < 0.001 ? 7 : 5)}` : '—') : (h.avgSold > 0 ? `$${h.avgSold.toFixed(h.avgSold < 0.001 ? 7 : 5)}` : '—');
                        const tokenAmt = h.lastTradeTokenAmount > 0 ? fmtCount(h.lastTradeTokenAmount) : isBuy ? (h.buyAmount > 0 ? fmtCount(h.buyAmount) : '—') : (h.sellAmount > 0 ? fmtCount(h.sellAmount) : '—');
                        const isSm = h.tags?.includes('smart_degen'); const isKol = h.tags?.includes('renowned');
                        const shortBy = h.name || `${h.address.slice(0, 6)}…${h.address.slice(-4)}`;
                        return (
                          <a key={h.address} href={`https://gmgn.ai/sol/address/${h.address}`} target="_blank" rel="noreferrer"
                            className="grid items-center py-2.5 px-3 hover:bg-white/5 transition-colors"
                            style={{ gridTemplateColumns: '52px 44px 90px 100px 1fr 110px' }}>
                            <span className="text-white/50 text-xs tabular-nums">{timeAgo}</span>
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold ${isBuy ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{isBuy ? 'B' : 'S'}</span>
                            <span className={`text-sm tabular-nums font-medium ${isBuy ? 'text-emerald-300' : 'text-red-300'}`}>{value}</span>
                            <span className="text-white/70 text-xs tabular-nums">{price}</span>
                            <span className="text-white text-xs tabular-nums truncate">{tokenAmt}</span>
                            <div className="flex items-center gap-1 justify-end min-w-0">
                              {isSm && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">SM</span>}
                              {isKol && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">KOL</span>}
                              <span className="font-mono text-purple-200 text-xs truncate">{shortBy}</span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: token info + swap card — order-1 on mobile (shows above chart) */}
          <div className="order-1 lg:order-2 lg:w-[300px] lg:shrink-0 space-y-3">
            <div className="bg-black/40 rounded-2xl border border-purple-500/20 px-4 py-4">
              <div className="flex items-center gap-3">
                {(() => {
                  const t: Token = (liveData?.live as Token) || readCachedToken(mint) || ({ mint } as Token);
                  const tokenForAvatar: Token = {
                    ...t,
                    mint,
                    name: t.name || info?.name,
                    symbol: t.symbol || info?.symbol,
                    imageUri: t.imageUri || info?.icon,
                  };
                  const rawBondPct = t.bondingPct ?? ((info as any)?.bondingProgress ?? 0);
                  const bondPct = Math.min(100, parseFloat((rawBondPct * 100).toFixed(1)));
                  const isMigrated = !!t.migrated || rawBondPct >= 1 || !!(info as any)?.graduatedPool;
                  return <TokenAvatar token={tokenForAvatar} bondPct={bondPct} migrated={isMigrated} size={80} />;
                })()}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl md:text-2xl font-bold text-white leading-tight">{info?.symbol || '—'}</span>
                    <span className="text-sm md:text-base text-white/60 truncate">{info?.name || 'Unknown'}</span>
                  </div>
                  {/* Price display */}
                  {(() => {
                    if (!priceUsd) return null;
                    const fmtP = (v: number) => v < 0.000001 ? `$${v.toExponential(2)}` : v < 0.001 ? `$${v.toFixed(7)}` : v < 1 ? `$${v.toFixed(5)}` : `$${v.toFixed(4)}`;
                    return (
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-lg md:text-xl font-bold text-emerald-300 tabular-nums">{fmtP(priceUsd)}</span>
                        <span className="text-xs text-white/30">USD</span>
                      </div>
                    );
                  })()}
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-white/50">
                    {info?.firstPool?.createdAt && (
                      <span>{relAge(info.firstPool.createdAt)}</span>
                    )}
                    <span className="font-mono">{shortMint(mint)}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(mint).catch(() => {})}
                      className="text-white/50 hover:text-white"
                      data-testid="button-copy-mint"
                      aria-label="Copy mint"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <SocialIcons socials={pickSocials(info)} mint={mint} />
                </div>
              </div>
            </div>

            <div className="bg-purple-900/40 border border-purple-500/20 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-y divide-purple-500/20">
                {(() => {
                  const live: any = liveData?.live || {};
                  const tx = (Number(jupMarket?.buys24h || live.buys) || 0) + (Number(jupMarket?.sells24h || live.sells) || 0);
                  return [
                    { label: 'MARKET CAP', value: fmtUsd(jupMarket?.marketCap ?? live.marketCapUsd) },
                    { label: 'LIQUIDITY', value: fmtUsd(jupMarket?.liquidity ?? live.liquidityUsd) },
                    { label: 'VOLUME 24H', value: fmtUsd(jupMarket?.volume24h ?? live.volumeUsd) },
                    { label: 'HOLDERS', value: jupMarket?.holders ? String(jupMarket.holders) : tx > 0 ? String(tx) : '—' },
                  ];
                })().map((s) => (
                  <div key={s.label} className="px-3 py-2.5 md:px-4 md:py-3 text-center min-w-0">
                    <div className="text-purple-300/70 text-[10px] font-semibold tracking-wider uppercase truncate">{s.label}</div>
                    <div className="text-white text-sm md:text-lg font-bold tabular-nums mt-0.5 truncate">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>


            <div className="hidden lg:block">
              <SwapCard token={tokenForTrade} />
            </div>
          </div>
        </div>
      </div>

      {tradeFor && (
        <TradeDialog token={tokenForTrade} action={tradeFor} onClose={() => setTradeFor(null)} />
      )}

      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-1 pt-0 pointer-events-none">
        <button
          onClick={() => setMobileSwapOpen(true)}
          className="pointer-events-auto w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold shadow-lg shadow-purple-900/40"
          data-testid="button-mobile-trade"
        >
          Trade
        </button>
      </div>
      <div className="lg:hidden h-20" />

      {mobileSwapOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end" data-testid="mobile-swap-sheet">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileSwapOpen(false)} />
          <div className="relative w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 border-t border-purple-500/40 rounded-t-2xl p-3 pb-5 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {info?.icon && <img src={info.icon} className="h-7 w-7 rounded-full" alt="" />}
                <div className="text-white font-bold text-lg">Trade {info?.symbol || ''}</div>
              </div>
              <button onClick={() => setMobileSwapOpen(false)} className="text-white text-3xl leading-none px-2" data-testid="button-close-swap">×</button>
            </div>
            <SwapCard token={tokenForTrade} flat />
          </div>
        </div>
      )}
    </div>
  );
}

function HolderStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'pos' | 'neg' }) {
  const color = tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-red-400' : 'text-white';
  return (
    <div className="py-3 px-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className={`text-base md:text-lg font-bold tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v == null || v === '') return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/50">{k}</span>
      <span className="text-white text-right">{v}</span>
    </div>
  );
}

function shortAddr(s?: string): string {
  if (!s) return '';
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}...${s.slice(-8)}`;
}

function InfoAddressRow({ label, value, isLast }: { label: string; value?: string; isLast?: boolean }) {
  const { toast } = useToast();
  const onCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied', description: shortAddr(value) });
    } catch {}
  };
  return (
    <div className={`px-4 py-3 ${isLast ? '' : 'border-b border-purple-500/20'}`}>
      <div className="text-purple-300/70 text-[10px] font-semibold tracking-wider uppercase mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-white font-mono text-sm break-all flex-1">{value ? value : '—'}</span>
        {value && (
          <button onClick={onCopy} className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white shrink-0" data-testid={`button-copy-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

function InfoTextRow({ label, value, isLast }: { label: string; value?: React.ReactNode; isLast?: boolean }) {
  if (!value) return null;
  return (
    <div className={`px-4 py-3 ${isLast ? '' : 'border-b border-purple-500/20'}`}>
      <div className="text-purple-300/70 text-[10px] font-semibold tracking-wider uppercase mb-1">{label}</div>
      <span className="text-white text-sm font-medium">{value}</span>
    </div>
  );
}

function SwapCard({ token, flat }: { token: Token; flat?: boolean }) {
  const { publicKey, signTransaction } = useReownWallet();
  const { toast } = useToast();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage] = useState('3');
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [balRefresh, setBalRefresh] = useState(0);
  const buyPresets = ['0.1', '0.3', '0.5', '0.7'];
  const sellPresets = ['25%', '50%', '75%', '100%'];
  const presets = side === 'buy' ? buyPresets : sellPresets;

  useEffect(() => {
    if (!publicKey) { setBalance(null); setTokenBalance(null); return; }
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/terminal/jup-holdings/${publicKey.toBase58()}`);
        if (!r.ok) return;
        const data = await r.json();
        if (active) {
          setBalance(data.sol ?? null);
          setTokenBalance(token?.mint ? (data.tokenBalances?.[token.mint] ?? null) : null);
        }
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [publicKey, busy, token?.mint, balRefresh]);

  const [jupQuote, setJupQuote] = useState<{ outRaw: number; loading: boolean } | null>(null);
  const [solUsdLocal, setSolUsdLocal] = useState<number | null>(null);
  const [orderCache, setOrderCache] = useState<{
    key: string; requestId: string; transaction: string; outRaw: number; ts: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/terminal/jup-price/So11111111111111111111111111111111111111112')
      .then(r => r.json())
      .then(d => { if (d?.price) setSolUsdLocal(Number(d.price)); })
      .catch(() => {});
  }, []);

  const live: any = token || {};
  const STANDARD_SUPPLY = 1_000_000_000;
  const resolvedSolUsd = Number(live.solUsd) || solUsdLocal || null;
  const priceSol = (live.priceUsd && resolvedSolUsd)
    ? Number(live.priceUsd) / resolvedSolUsd
    : (live.priceSol ?? (live.marketCapSol ? live.marketCapSol / STANDARD_SUPPLY : undefined));
  const sym = (live.symbol || 'TOKEN').toString().slice(0, 8);

  // Jupiter quote for display — no wallet needed
  useEffect(() => {
    const amtNum = Number(amount);
    if (!amount || amount.endsWith('%') || !isFinite(amtNum) || amtNum <= 0 || !token?.mint) {
      setJupQuote(null);
      setOrderCache(null);
      return;
    }
    setJupQuote((prev) => prev ? { ...prev, loading: true } : { outRaw: 0, loading: true });
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const decimals = (token as any).decimals ?? 6;
    const inputMint = side === 'buy' ? SOL_MINT : token.mint;
    const outputMint = side === 'buy' ? token.mint : SOL_MINT;
    const rawAmount = side === 'buy'
      ? Math.round(amtNum * 1e9)
      : Math.round(amtNum * Math.pow(10, decimals));
    if (rawAmount <= 0) { setJupQuote(null); setOrderCache(null); return; }
    const cacheKey = `${inputMint}:${outputMint}:${rawAmount}`;
    let cancelled = false;
    (async () => {
      try {
        // Use quote endpoint (no wallet needed) for display
        const qParams = new URLSearchParams({ inputMint, outputMint, amount: rawAmount.toString() });
        const qr = await fetch(`/api/terminal/jupiter-quote?${qParams}`, { signal: AbortSignal.timeout(8000) });
        if (cancelled) return;
        if (qr.ok) {
          const qdata = await qr.json();
          const outRaw = Number(qdata.outAmount);
          if (isFinite(outRaw) && outRaw > 0) {
            setJupQuote({ outRaw, loading: false });
          } else {
            setJupQuote(null);
          }
        } else {
          setJupQuote(null);
        }
        // Also pre-fetch order if wallet connected (cache for fast submit)
        if (publicKey && !cancelled) {
          const oParams = new URLSearchParams({ inputMint, outputMint, amount: rawAmount.toString(), taker: publicKey.toBase58() });
          const or = await fetch(`/api/terminal/jupiter-order?${oParams}`, { signal: AbortSignal.timeout(8000) });
          if (cancelled) return;
          if (or.ok) {
            const odata = await or.json();
            if (odata.transaction && odata.requestId) {
              setOrderCache({ key: cacheKey, requestId: odata.requestId, transaction: odata.transaction, outRaw: Number(odata.outAmount), ts: Date.now() });
            }
          }
        }
      } catch {
        if (!cancelled) { setJupQuote(null); setOrderCache(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [amount, side, token?.mint, publicKey?.toBase58()]);

  function fmtNum(n: number, max = 6) {
    if (!isFinite(n)) return '—';
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(4);
    return n.toFixed(max);
  }

  let quote = '';
  const amtNum = Number(amount);
  if (priceSol && amount && !amount.endsWith('%') && isFinite(amtNum) && amtNum > 0) {
    if (side === 'buy') {
      quote = `≈ ${fmtNum(amtNum / priceSol, 2)} ${sym}`;
    } else {
      quote = `≈ ${fmtNum(amtNum * priceSol, 6)} SOL`;
    }
  } else if (side === 'sell' && amount.endsWith('%')) {
    quote = 'sell % of balance';
  }

  async function submit() {
    if (!publicKey) { toast({ title: 'Connect wallet first' }); return; }
    if (!signTransaction) { toast({ title: 'Wallet does not support signing', variant: 'destructive' }); return; }
    const amt = amount.trim();
    if (!amt) { toast({ title: 'Enter amount' }); return; }
    setBusy(true);
    try {
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const numAmt = Number(amt);
      const inputMint = side === 'buy' ? SOL_MINT : token.mint;
      const outputMint = side === 'buy' ? token.mint : SOL_MINT;
      let rawAmount: number;
      if (side === 'buy') {
        rawAmount = Math.round(numAmt * 1e9);
      } else {
        const decimals = (token as any).decimals ?? 6;
        const tokenAmt = amt.endsWith('%') ? (tokenBalance || 0) * (numAmt / 100) : numAmt;
        rawAmount = Math.round(tokenAmt * Math.pow(10, decimals));
      }
      if (rawAmount <= 0) throw new Error('Amount too small');

      const cacheKey = `${inputMint}:${outputMint}:${rawAmount}`;
      const cached = orderCache && orderCache.key === cacheKey && (Date.now() - orderCache.ts) < 55000 ? orderCache : null;
      let order: { requestId: string; transaction: string };
      if (cached) {
        order = { requestId: cached.requestId, transaction: cached.transaction };
      } else {
        const orderParams = new URLSearchParams({ inputMint, outputMint, amount: rawAmount.toString(), taker: publicKey.toBase58() });
        const orderRes = await fetch(`/api/terminal/jupiter-order?${orderParams}`);
        const orderData = await orderRes.json();
        if (!orderRes.ok || orderData.error || !orderData.transaction) throw new Error(orderData.error || 'No Jupiter route found');
        order = orderData;
      }

      const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
      const signed = await signTransaction(tx);
      const signedTx = Buffer.from(signed.serialize()).toString('base64');

      const decimals = (token as any).decimals ?? 6;
      const humanInput = side === 'buy' ? numAmt : (amt.endsWith('%') ? (tokenBalance || 0) * (numAmt / 100) : numAmt);
      const outRaw = (cached?.outRaw || (jupQuote && !jupQuote.loading ? jupQuote.outRaw : 0));
      const humanOutput = outRaw > 0 ? (side === 'buy' ? outRaw / Math.pow(10, decimals) : outRaw / 1e9) : 0;

      const execRes = await fetch('/api/terminal/jupiter-execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: signedTx,
          requestId: order.requestId,
          walletAddress: publicKey.toBase58(),
          inputMint,
          outputMint,
          inputAmount: humanInput.toString(),
          outputAmount: humanOutput.toString(),
          inputSymbol: side === 'buy' ? 'SOL' : sym,
          outputSymbol: side === 'buy' ? sym : 'SOL',
        }),
      });
      const result = await execRes.json();

      if (result.status !== 'Success') throw new Error(result.error || `Status: ${result.status}`);

      setTimeout(() => setBalRefresh((n) => n + 1), 1500);
      const url = `https://solscan.io/tx/${result.signature}`;
      toast({
        title: 'Swap Successful!',
        description: (<span>Jupiter swap confirmed<br /><a href={url} target="_blank" rel="noreferrer" className="underline">View on Solscan →</a></span>) as any,
        className: 'bg-green-600 border-green-700 text-white',
      });
      setAmount('');
    } catch (e: any) {
      toast({ title: 'Trade failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={flat ? 'space-y-2' : 'bg-purple-900/40 border border-purple-500/20 rounded-2xl p-2.5 space-y-2'}>
      <div className="grid grid-cols-2 bg-purple-950/50 border border-purple-500/20 rounded-lg p-0.5 gap-0.5">
        <button
          onClick={() => { setSide('buy'); setAmount(''); }}
          className={`py-1.5 rounded-md text-sm font-semibold transition flex items-center justify-center gap-1 text-white ${side === 'buy' ? 'bg-purple-600' : 'hover:bg-white/5'}`}
          data-testid="swap-tab-buy"
        ><Zap className="h-3 w-3" /> Buy</button>
        <button
          onClick={() => { setSide('sell'); setAmount(''); }}
          className={`py-1.5 rounded-md text-sm font-semibold transition flex items-center justify-center gap-1 text-white ${side === 'sell' ? 'bg-purple-600' : 'hover:bg-white/5'}`}
          data-testid="swap-tab-sell"
        ><ArrowDownUp className="h-3 w-3" /> Sell</button>
      </div>
      {(() => {
        const paySym = side === 'buy' ? 'SOL' : sym;
        const recvSym = side === 'buy' ? sym : 'SOL';
        let recvVal = '0.0';
        const decimals = (token as any).decimals ?? 6;
        if (jupQuote && !jupQuote.loading && jupQuote.outRaw > 0) {
          recvVal = side === 'buy'
            ? fmtNum(jupQuote.outRaw / Math.pow(10, decimals), 2)
            : fmtNum(jupQuote.outRaw / 1e9, 6);
        } else if (jupQuote?.loading) {
          recvVal = '…';
        } else if (priceSol && amount && !amount.endsWith('%') && isFinite(amtNum) && amtNum > 0) {
          recvVal = side === 'buy' ? fmtNum(amtNum / priceSol, 2) : fmtNum(amtNum * priceSol, 6);
        }
        const balText = side === 'buy'
          ? `${balance != null ? balance.toFixed(4) : '0.0000'} SOL`
          : `${tokenBalance != null ? fmtNum(tokenBalance, 4) : '0'} ${sym}`;
        const allPresets = [...presets, 'MAX'];
        return (
          <>
            <div className="flex items-center text-xs text-white/70">
              Balance: <span className="text-white ml-1">{balText}</span>
            </div>
            <div className="bg-purple-950/50 rounded-lg border border-purple-500/40 px-3 py-1.5 flex items-center gap-2">
              <div className="text-white text-sm font-semibold">{paySym}</div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
                className="flex-1 bg-transparent text-white text-sm font-bold outline-none"
                data-testid="input-swap-amount"
              />
            </div>
            <div className="grid grid-cols-5 gap-1">
              {allPresets.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    if (p === 'MAX') {
                      if (side === 'buy' && balance != null) setAmount(Math.max(0, balance - 0.01).toFixed(4));
                      else if (tokenBalance != null) setAmount(String(tokenBalance));
                    } else if (p.endsWith('%')) {
                      const pct = parseFloat(p) / 100;
                      if (side === 'sell' && tokenBalance != null) setAmount(String(tokenBalance * pct));
                      else if (side === 'buy' && balance != null) setAmount((balance * pct).toFixed(4));
                    } else setAmount(p);
                  }}
                  className="py-1 rounded-md text-xs bg-purple-950/50 border border-purple-500/20 text-white hover:bg-purple-600/40"
                  data-testid={`swap-preset-${p}`}
                >{p}</button>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/70">You receive:</span>
              <span className="text-white font-semibold tabular-nums">{recvVal} {recvSym}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/70">Fee</span>
              <span className="text-white font-semibold">0.50%</span>
            </div>
          </>
        );
      })()}
      <Button
        onClick={submit}
        disabled={busy || !publicKey}
        className={`w-full py-2.5 text-sm font-bold rounded-xl ${side === 'buy' ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90' : 'bg-gradient-to-r from-red-600 to-pink-600 hover:opacity-90'}`}
        data-testid="button-quick-swap"
      >
        {busy ? 'Sending…' : !publicKey ? 'Connect Wallet' : side === 'buy' ? 'Buy' : 'Sell'}
      </Button>
    </div>
  );
}

function TradeDialog({ token, action, onClose }: { token: Token; action: 'buy' | 'sell'; onClose: () => void }) {
  const { publicKey, signTransaction } = useReownWallet();
  const { toast } = useToast();
  const [amount, setAmount] = useState(action === 'buy' ? '0.01' : '');
  const [busy, setBusy] = useState(false);
  const [sig, setSig] = useState<string | null>(null);

  async function submit() {
    if (!publicKey) { toast({ title: 'Connect wallet first' }); return; }
    if (!signTransaction) { toast({ title: 'Wallet does not support signing', variant: 'destructive' }); return; }
    const amt = amount.trim();
    if (!amt) { toast({ title: 'Enter amount' }); return; }
    setBusy(true);
    try {
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const numAmt = Number(amt);
      const inputMint = action === 'buy' ? SOL_MINT : token.mint;
      const outputMint = action === 'buy' ? token.mint : SOL_MINT;
      let rawAmount: number;
      if (action === 'buy') {
        rawAmount = Math.round(numAmt * 1e9);
      } else {
        const decimals = (token as any).decimals ?? 6;
        rawAmount = Math.round(numAmt * Math.pow(10, decimals));
      }
      if (rawAmount <= 0) throw new Error('Amount too small');

      const orderParams = new URLSearchParams({
        inputMint, outputMint,
        amount: rawAmount.toString(),
        taker: publicKey.toBase58(),
      });
      const orderRes = await fetch(`/api/terminal/jupiter-order?${orderParams}`);
      const order = await orderRes.json();
      if (!orderRes.ok || order.error || !order.transaction) {
        throw new Error(order.error || 'No Jupiter route found');
      }

      const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
      const signed = await signTransaction(tx);
      const signedTx = Buffer.from(signed.serialize()).toString('base64');

      const decimals = (token as any).decimals ?? 6;
      const humanInput = numAmt;
      const outRaw = Number(order.outAmount || 0);
      const humanOutput = outRaw > 0 ? (action === 'buy' ? outRaw / Math.pow(10, decimals) : outRaw / 1e9) : 0;
      const sym = (token.symbol || 'TOKEN').toString().slice(0, 8);

      const execRes = await fetch('/api/terminal/jupiter-execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: signedTx,
          requestId: order.requestId,
          walletAddress: publicKey.toBase58(),
          inputMint,
          outputMint,
          inputAmount: humanInput.toString(),
          outputAmount: humanOutput.toString(),
          inputSymbol: action === 'buy' ? 'SOL' : sym,
          outputSymbol: action === 'buy' ? sym : 'SOL',
        }),
      });
      const result = await execRes.json();
      if (result.status !== 'Success') throw new Error(result.error || `Status: ${result.status}`);

      setSig(result.signature);
      toast({
        title: 'Swap Successful!',
        description: result.signature.slice(0, 12) + '…',
        className: 'bg-green-600 border-green-700 text-white',
      });
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
            <label className="text-xs text-white/60">Amount {action === 'buy' ? '(SOL)' : '(tokens)'}</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-black/40 border-white/10 mt-1" data-testid="input-amount" />
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

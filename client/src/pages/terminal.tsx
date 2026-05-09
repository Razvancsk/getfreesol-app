import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import logoImage from '@assets/image_1757882056840.png';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Flame, Sparkles, Rocket, Search, ExternalLink, TrendingUp, TrendingDown, Copy, Globe, Send, MessageCircle, Droplet, Hammer } from 'lucide-react';
import { SiX, SiDiscord, SiTelegram } from 'react-icons/si';

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
  migrated?: boolean;
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
  return <>$0.0<sub className="text-[0.7em]">{zeros}</sub>{sig}</>;
}
const AVATAR_COLORS = ['bg-pink-600', 'bg-purple-600', 'bg-indigo-600', 'bg-blue-600', 'bg-emerald-600', 'bg-orange-600', 'bg-rose-600', 'bg-fuchsia-600'];
function colorFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function TokenAvatar({ token, bondPct, migrated, size = 92 }: { token: Token; bondPct: number; migrated: boolean; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = (token.symbol || token.name || '?').slice(0, 2).toUpperCase();
  const color = colorFor(token.mint);
  const showImg = token.imageUri && !failed;
  const SIZE = size;
  const IMG = size - 8;
  const STROKE = 3;
  const RX = Math.round(size * 0.16);
  const pct = migrated ? 100 : Math.max(0, Math.min(100, bondPct));
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
          stroke="rgba(255,255,255,0.1)" strokeWidth={STROKE} fill="none"
        />
        {pct > 0 && (
          <rect
            x={STROKE / 2} y={STROKE / 2}
            width={SIZE - STROKE} height={SIZE - STROKE}
            rx={RX} ry={RX}
            stroke={ringColor} strokeWidth={STROKE} fill="none"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${pct} 100`}
            style={{ transition: 'stroke-dasharray 600ms ease' }}
          />
        )}
      </svg>
      <div
        className="absolute"
        style={{ width: IMG, height: IMG, left: (SIZE - IMG) / 2, top: (SIZE - IMG) / 2 }}
      >
        {showImg ? (
          <img
            src={token.imageUri}
            alt={`${token.symbol} logo`}
            className="block w-full h-full rounded-xl object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="w-full h-full rounded-xl bg-white/5" />
        )}
      </div>
      {pct > 0 && (
        <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-black/70 border border-white/10 text-[9px] font-bold tabular-nums leading-none"
          style={{ color: ringColor }}
        >
          {migrated ? '✓' : `${Math.round(pct)}%`}
        </div>
      )}
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
  { id: 'new',       label: 'New',           icon: Sparkles, sub: 'All launchpads' },
  { id: 'bonding',   label: 'Almost Migrated', icon: Flame,    sub: '50%–99% bonded' },
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

function SocialIcons({ socials }: { socials: { twitter?: string; website?: string; telegram?: string; discord?: string } }) {
  const items: { href: string; icon: any; label: string }[] = [];
  if (socials.twitter) items.push({ href: socials.twitter, icon: SiX, label: 'X' });
  if (socials.website) items.push({ href: socials.website, icon: Globe, label: 'Website' });
  if (socials.telegram) items.push({ href: socials.telegram, icon: SiTelegram, label: 'Telegram' });
  if (socials.discord) items.push({ href: socials.discord, icon: SiDiscord, label: 'Discord' });
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-2">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <a
            key={it.label}
            href={it.href}
            target="_blank"
            rel="noreferrer"
            aria-label={it.label}
            className="text-white/70 hover:text-white p-1.5 rounded-md hover:bg-white/10"
            data-testid={`link-social-${it.label.toLowerCase()}`}
          >
            <Icon className="h-5 w-5" />
          </a>
        );
      })}
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
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Terminal</h1>
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

export function TerminalView() {
  const [tab, setTab] = useState<FeedType>('new');
  const [search, setSearch] = useState('');
  const [tradeFor, setTradeFor] = useState<{ token: Token; action: 'buy' | 'sell' } | null>(null);
  const [, navigate] = useLocation();

  const cacheKey = `terminal_feed_cache_${tab}`;
  const { data, isFetching } = useQuery<{ tokens: Token[]; status: any }>({
    queryKey: ['/api/terminal/feed', tab],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/feed?type=${tab}&limit=25`);
      if (!r.ok) throw new Error('feed failed');
      const json = await r.json();
      try {
        if (json?.tokens?.length) {
          localStorage.setItem(cacheKey, JSON.stringify(json));
        }
      } catch {}
      return json;
    },
    refetchInterval: 1500,
    initialData: () => {
      try {
        const raw = localStorage.getItem(cacheKey);
        return raw ? JSON.parse(raw) : undefined;
      } catch { return undefined; }
    },
  });

  const debouncedSearch = useDebounced(search.trim(), 300);
  const { data: searchData, isFetching: searchFetching } = useQuery<{ tokens: Token[] }>({
    queryKey: ['/api/terminal/search', debouncedSearch],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/search?q=${encodeURIComponent(debouncedSearch)}`);
      if (!r.ok) throw new Error('search failed');
      return r.json();
    },
    enabled: debouncedSearch.length > 0,
    staleTime: 30_000,
  });

  const tokens = useMemo(() => {
    if (debouncedSearch.length > 0) return searchData?.tokens ?? [];
    return data?.tokens ?? [];
  }, [data, searchData, debouncedSearch]);

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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto no-scrollbar">
          {tokens.length === 0 && (
            <div className="px-4 py-16 text-center text-white/50 text-sm bg-purple-900/20 border border-white/10 rounded-2xl">
              {isFetching ? 'Loading feed…' : 'No tokens yet — waiting for stream events.'}
            </div>
          )}
          {tokens.map((t) => {
            const totalTx = (t.buys ?? 0) + (t.sells ?? 0);
            const pct = t.pctChange;
            const pctUp = (pct ?? 0) >= 0;
            const bondPct = Math.min(100, Math.round((t.bondingPct ?? 0) * 100));
            const isMigrated = tab === 'migrated' || (t.bondingPct ?? 0) >= 1;
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
                    <div className="font-bold text-white text-base tabular-nums">{fmtPriceUsd(t.priceUsd)}</div>
                    {pct != null && Number.isFinite(pct) ? (
                      <div className={`text-right text-sm font-medium ${pctUp ? 'text-green-400' : 'text-red-400'}`}>
                        {pctUp ? '+' : ''}{(pct ?? 0).toFixed(2)}%
                      </div>
                    ) : (
                      <div className="text-gray-400 text-sm">—</div>
                    )}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <div className="text-white">Market Cap</div>
                    <div className="text-white font-medium tabular-nums">{fmtUsd(t.marketCapUsd)}</div>
                  </div>
                  <div>
                    <div className="text-white">Volume 24h</div>
                    <div className="text-white font-medium tabular-nums">{fmtUsd(t.volumeUsd)}</div>
                  </div>
                  <div>
                    <div className="text-white">Liquidity</div>
                    <div className="text-white font-medium tabular-nums">{fmtUsd(t.liquidityUsd)}</div>
                  </div>
                  <div>
                    <div className="text-white">Transactions</div>
                    <div className="text-white font-medium tabular-nums">{fmtCount(totalTx)}</div>
                  </div>
                </div>

              </div>
            );
          })}
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

type JupMint = {
  id: string; name?: string; symbol?: string; icon?: string;
  decimals?: number; twitter?: string; website?: string; telegram?: string; discord?: string; dev?: string;
  circSupply?: number; totalSupply?: number; holderCount?: number;
  fdv?: number; mcap?: number; usdPrice?: number; liquidity?: number;
  organicScore?: number; isVerified?: boolean;
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean; topHoldersPercentage?: number; devBalancePercentage?: number };
  stats5m?: { holderChange?: number;[k: string]: any }; stats1h?: { holderChange?: number;[k: string]: any }; stats6h?: { holderChange?: number;[k: string]: any }; stats24h?: { holderChange?: number;[k: string]: any };
  firstPool?: { id?: string; createdAt?: string; launchpad?: string };
  launchpad?: string; graduatedPool?: string;
  socials?: { twitter?: string; website?: string; telegram?: string; discord?: string };
  metadata?: { extensions?: { twitter?: string; website?: string; telegram?: string; discord?: string } };
};

function pickSocials(info?: JupMint): { twitter?: string; website?: string; telegram?: string; discord?: string } {
  if (!info) return {};
  const ext = (info as any)?.metadata?.extensions || {};
  const s = (info as any)?.socials || {};
  return {
    twitter: info.twitter || s.twitter || ext.twitter,
    website: info.website || s.website || ext.website,
    telegram: (info as any).telegram || s.telegram || ext.telegram,
    discord: (info as any).discord || s.discord || ext.discord,
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
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const mint = params?.mint || '';
  const shortAddr = publicKey ? `${publicKey.toString().slice(0, 4)}…${publicKey.toString().slice(-4)}` : '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-purple-950 to-slate-950 flex flex-col overflow-x-hidden">
      <div className="container mx-auto max-w-4xl px-4 pt-3 pb-6 flex-1">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2" data-testid="link-home">
            <img src={logoImage} alt="Get your SOL back!" className="h-10 w-auto" />
          </button>
          <Button
            onClick={() => setVisible(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30"
            data-testid="button-connect-wallet"
          >
            {publicKey ? shortAddr : 'Connect Wallet'}
          </Button>
        </div>
        <TokenContent mint={mint} onBack={() => navigate('/?tab=terminal')} />
      </div>
    </div>
  );
}

export function TokenContent({ mint, onBack }: { mint: string; onBack?: () => void }) {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<'chart' | 'info' | 'holders'>('chart');
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
      // Fallback: search all 3 feeds (same source the cards render from)
      for (const tab of ['new', 'bonding', 'migrated'] as const) {
        try {
          const fr = await fetch(`/api/terminal/feed?type=${tab}&limit=200`);
          if (!fr.ok) continue;
          const fj = await fr.json();
          const found = (fj?.tokens || []).find((t: any) => t?.mint === mint);
          if (found) return { live: found as Token };
        } catch {}
      }
      return { live: null };
    },
    refetchInterval: 1500,
    enabled: !!mint,
  });
  const { data: holdersData, isFetching: holdersLoading } = useQuery<{ holders: { address: string; owner?: string; amount: number; label?: string }[] }>({
    queryKey: ['/api/terminal/holders', mint],
    queryFn: async () => {
      const r = await fetch(`/api/terminal/holders/${mint}`);
      if (!r.ok) throw new Error('holders failed');
      return r.json();
    },
    enabled: tab === 'holders' && !!mint,
    staleTime: 60_000,
  });

  const s24 = info?.stats24h || {};
  const pct24 = typeof s24.priceChange === 'number' ? s24.priceChange : undefined;
  const pctUp = (pct24 ?? 0) >= 0;
  const totalSupply = info?.totalSupply ?? info?.circSupply ?? 0;
  const tokenForTrade: Token = {
    mint,
    name: info?.name,
    symbol: info?.symbol,
    imageUri: info?.icon,
    priceUsd: info?.usdPrice,
  };

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

        <div className="bg-black/40 rounded-2xl border border-purple-500/20 px-4 py-4 md:px-5 md:py-4 mb-4 w-full md:w-auto md:min-w-[480px] md:inline-flex md:max-w-full">
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
              const bondPct = Math.min(100, Math.round((t.bondingPct ?? 0) * 100));
              const isMigrated = !!t.migrated || (t.bondingPct ?? 0) >= 1 || !!(info as any)?.graduatedPool;
              return <TokenAvatar token={tokenForAvatar} bondPct={bondPct} migrated={isMigrated} size={80} />;
            })()}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl md:text-2xl font-bold text-white leading-tight">{info?.symbol || '—'}</span>
                <span className="text-sm md:text-base text-white/60 truncate">{info?.name || 'Unknown'}</span>
                {info?.isVerified && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/40">Verified</span>
                )}
              </div>
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
              <SocialIcons socials={pickSocials(info)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 md:gap-3 mb-4">
          {(() => {
            const live: any = liveData?.live || {};
            const tx = (Number(live.buys)||0) + (Number(live.sells)||0);
            return [
              { label: 'LIQUIDITY', value: fmtUsd(live.liquidityUsd) },
              { label: 'MARKET CAP', value: fmtUsd(live.marketCapUsd) },
              { label: 'VOLUME', value: fmtUsd(live.volumeUsd) },
              { label: 'TXNS', value: fmtCount(tx || undefined) },
            ];
          })().map((s) => (
            <div key={s.label} className="bg-purple-900/40 border border-purple-500/20 rounded-2xl px-2 py-3 md:px-4 md:py-4 text-center min-w-0">
              <div className="text-purple-300/70 text-[10px] md:text-xs font-semibold tracking-wider uppercase truncate">{s.label}</div>
              <div className="text-white text-base md:text-2xl font-bold tabular-nums mt-1 truncate">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-3">
          {(['chart', 'info', 'holders'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm capitalize ${tab === id ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
              data-testid={`detail-tab-${id}`}
            >{id}</button>
          ))}
        </div>

        {tab === 'chart' && (
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
            <iframe
              src={`https://dexscreener.com/solana/${mint}?embed=1&theme=dark&trades=1&info=0`}
              className="w-full"
              style={{ height: 600, border: 0 }}
              title="chart"
            />
          </div>
        )}

        {tab === 'info' && (
          <div className="bg-black/40 rounded-2xl border border-purple-500/20 overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-purple-500/20 border-b border-purple-500/20">
              <div className="py-5 text-center">
                <div className="text-white/60 text-sm">Total Supply</div>
                <div className="text-white text-2xl font-bold tabular-nums mt-1">{fmtNum(info?.totalSupply) || '—'}</div>
              </div>
              <div className="py-5 text-center">
                <div className="text-white/60 text-sm">Cir Supply</div>
                <div className="text-white text-2xl font-bold tabular-nums mt-1">{fmtNum(info?.circSupply) || '—'}</div>
              </div>
            </div>

            <InfoAddressRow label="Contract Address" value={mint} />
            <InfoAddressRow label="Developer Address" value={info?.dev} />
            {(() => {
              const graduatedPool = (info as any)?.graduatedPool || (info as any)?.firstPool?.graduatedPool;
              const isGraduated = !!graduatedPool || (info as any)?.graduated === true || (info as any)?.firstPool?.graduated === true;
              return (
                <>
                  <InfoTextRow label="Launchpad" value={info?.firstPool?.launchpad || (info as any)?.launchpad} isLast={!isGraduated} />
                  {isGraduated && <InfoTextRow label="Graduated Pool" value={graduatedPool} isLast />}
                </>
              );
            })()}

            {(info?.twitter || info?.website) && (
              <div className="flex flex-wrap gap-2 p-4 border-t border-purple-500/20">
                {info?.twitter && <a href={info.twitter} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 inline-flex items-center gap-1">Twitter <ExternalLink className="h-3 w-3" /></a>}
                {info?.website && <a href={info.website} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 inline-flex items-center gap-1">Website <ExternalLink className="h-3 w-3" /></a>}
                <a href={`https://solscan.io/token/${mint}`} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 inline-flex items-center gap-1">Solscan <ExternalLink className="h-3 w-3" /></a>
                <a href={`https://dexscreener.com/solana/${mint}`} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 inline-flex items-center gap-1">DexScreener <ExternalLink className="h-3 w-3" /></a>
              </div>
            )}
          </div>
        )}

        {tab === 'holders' && (
          <div className="bg-black/40 rounded-2xl border border-purple-500/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Top holders</h3>
              <a
                href={`https://app.bubblemaps.io/sol/token/${mint}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/80 border border-white/10"
              >
                Bubble map
              </a>
            </div>
            {holdersLoading && <div className="text-center text-white/50 text-sm py-6">Loading top holders…</div>}
            {!holdersLoading && (holdersData?.holders?.length ?? 0) === 0 && (
              <div className="text-center text-white/50 text-sm py-6">No holders found.</div>
            )}
            <div className="divide-y divide-white/5">
              {(() => {
                const devAddr = info?.dev;
                const poolAddr = (info as any)?.firstPool?.id;
                const gradAddr = (info as any)?.graduatedPool;
                const lpName = info?.firstPool?.launchpad || (info as any)?.launchpad;
                const tagFor = (h: { address: string; owner?: string; label?: string }) => {
                  const o = h.owner || h.address;
                  if (devAddr && o === devAddr) {
                    return { name: 'Dev', icon: Hammer, color: 'text-amber-400' };
                  }
                  if (
                    h.label === 'pump.fun-bonding-curve' ||
                    (h.label && h.label.startsWith('liquidity-pool:')) ||
                    (poolAddr && poolAddr !== mint && (o === poolAddr || h.address === poolAddr)) ||
                    (gradAddr && (o === gradAddr || h.address === gradAddr))
                  ) {
                    return { name: 'Liquidity pool', icon: Droplet, color: 'text-sky-400' };
                  }
                  return null;
                };
                const list = [...(holdersData?.holders || [])];
                const devPct = info?.audit?.devBalancePercentage;
                if (devAddr && totalSupply > 0 && devPct && devPct > 0 && !list.some((h) => (h.owner || h.address) === devAddr)) {
                  list.push({ address: devAddr, owner: devAddr, amount: (devPct / 100) * totalSupply });
                  list.sort((a, b) => b.amount - a.amount);
                }
                return list.slice(0, 20).map((h) => {
                  const pct = totalSupply > 0 ? (h.amount / totalSupply) * 100 : 0;
                  const tag = tagFor(h);
                  const linkAddr = h.owner || h.address;
                  return (
                    <div key={h.address} className="flex items-center justify-between py-3 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {tag ? (
                          <>
                            <span className="text-white">{tag.name}</span>
                            <tag.icon className={`h-4 w-4 ${tag.color}`} />
                          </>
                        ) : (
                          <a href={`https://solscan.io/account/${linkAddr}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-purple-300 hover:underline truncate">
                            {shortMint(linkAddr)}
                          </a>
                        )}
                      </div>
                      <div className="text-white tabular-nums">{pct.toFixed(2)}%</div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>

      {tradeFor && (
        <TradeDialog token={tokenForTrade} action={tradeFor} onClose={() => setTradeFor(null)} />
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
    <div className={`py-5 px-4 text-center ${isLast ? '' : 'border-b border-purple-500/20'}`}>
      <div className="text-white/60 text-sm">{label}</div>
      <div className="flex items-center justify-center gap-2 mt-2">
        <span className="text-white font-mono text-sm">{value ? shortAddr(value) : '—'}</span>
        {value && (
          <button onClick={onCopy} className="text-xs px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white" data-testid={`button-copy-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

function InfoTextRow({ label, value, isLast }: { label: string; value?: React.ReactNode; isLast?: boolean }) {
  return (
    <div className={`py-5 px-4 text-center ${isLast ? '' : 'border-b border-purple-500/20'}`}>
      <div className="text-white/60 text-sm">{label}</div>
      <div className="text-white text-base mt-2">{value || '—'}</div>
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

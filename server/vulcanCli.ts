/**
 * Wrapper around the Vulcan CLI for Phoenix Perpetuals.
 * https://github.com/Ellipsis-Labs/vulcan-cli
 *
 * Vulcan is designed for AI agents — this module drives it from Node.js.
 * All commands use `-o json` and return { ok, data } or { ok: false, error }.
 *
 * Symbol convention: Vulcan uses SOL/BTC/ETH (no -PERP suffix).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

let _bin: string | null = null;

function findBin(): string {
  if (_bin !== null) return _bin;
  const candidates = [
    path.join(homedir(), '.local', 'bin', 'vulcan'),
    '/root/.local/bin/vulcan',
    '/home/render/.local/bin/vulcan',
    process.env.VULCAN_BIN ?? '',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) { _bin = c; return c; }
  }
  _bin = 'vulcan'; // rely on PATH
  return 'vulcan';
}

export function vulcanAvailable(): boolean {
  return [
    path.join(homedir(), '.local', 'bin', 'vulcan'),
    '/root/.local/bin/vulcan',
    '/home/render/.local/bin/vulcan',
    process.env.VULCAN_BIN ?? '',
  ].filter(Boolean).some(c => existsSync(c));
}

/** Strip -PERP suffix; Vulcan uses uppercase ticker only (SOL, BTC, ETH). */
export function toVulcanSymbol(symbol: string): string {
  return symbol.replace(/-PERP$/i, '').toUpperCase();
}

async function run(args: string[], timeoutMs = 15000): Promise<any> {
  const bin = findBin();
  try {
    const { stdout } = await execFileAsync(bin, [...args, '-o', 'json'], {
      timeout: timeoutMs,
      env: { ...process.env, HOME: homedir() },
    });
    const result = JSON.parse(stdout.trim());
    if (!result.ok) throw new Error(result.error?.message ?? 'vulcan error');
    return result.data;
  } catch (e: any) {
    const msg = e?.stderr ? `${e.message}: ${e.stderr}` : e.message;
    throw new Error(`vulcan: ${msg}`);
  }
}

// ── Market data (no auth required) ───────────────────────────────────────────

export const marketList = () =>
  run(['market', 'list']);

export const marketTicker = (symbol: string) =>
  run(['market', 'ticker', toVulcanSymbol(symbol)]);

export const marketInfo = (symbol: string) =>
  run(['market', 'info', toVulcanSymbol(symbol)]);

export const marketOrderbook = (symbol: string, depth = 15) =>
  run(['market', 'orderbook', toVulcanSymbol(symbol), '--depth', String(depth)]);

export const marketCandles = (symbol: string, interval = '1h', limit = 100) =>
  run(['market', 'candles', toVulcanSymbol(symbol),
    '--interval', interval,
    '--limit', String(limit),
  ]);

// ── Technical analysis (no auth required) ────────────────────────────────────

export const taReport = (symbol: string, timeframe = '1h') =>
  run(['ta', 'report', toVulcanSymbol(symbol), '--timeframe', timeframe]);

export const taCompute = (symbol: string, indicator: string, timeframe = '1h', period?: number) => {
  const args = ['ta', 'compute', toVulcanSymbol(symbol),
    '--indicator', indicator,
    '--timeframe', timeframe,
  ];
  if (period) args.push('--period', String(period));
  return run(args);
};

// ── Paper trading (no auth / no wallet required) ──────────────────────────────

export const paperInit = (balance = 10000) =>
  run(['paper', 'init', '--balance', String(balance)]);

export const paperStatus = () =>
  run(['paper', 'status']);

export const paperPositions = () =>
  run(['paper', 'positions']);

export const paperFills = (limit = 30) =>
  run(['paper', 'fills', '--limit', String(limit)]);

export const paperBuy = (symbol: string, notionalUsdc: number) =>
  run(['paper', 'buy', toVulcanSymbol(symbol),
    '--notional-usdc', String(notionalUsdc),
    '--type', 'market',
  ]);

export const paperSell = (symbol: string, notionalUsdc: number) =>
  run(['paper', 'sell', toVulcanSymbol(symbol),
    '--notional-usdc', String(notionalUsdc),
    '--type', 'market',
  ]);

export const paperCancelAll = (symbol?: string) => {
  const args = ['paper', 'cancel-all'];
  if (symbol) args.push(toVulcanSymbol(symbol));
  return run(args);
};

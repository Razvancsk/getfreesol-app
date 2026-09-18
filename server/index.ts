import express, { type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { connection, FEE_BPS, FEES_WALLET, parseOwner, REOWN_PROJECT_ID } from "./config";
import { buildBurnTransactions, buildClaimTransactions, scanTokens } from "./tokens";
import { buildNftBurnTransactions, scanNfts } from "./nfts";
import { buildRewardTransactions, isRewardId, scanRewards } from "./rewards";
import type { PublicKey } from "@solana/web3.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const MAX_SELECTED = 300;

function selection(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Nothing selected");
  if (value.length > MAX_SELECTED) throw new Error(`Select at most ${MAX_SELECTED} items at once`);
  return value.map(String);
}

function handler(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[api] ${req.method} ${req.path}:`, message);
      res.status(400).json({ error: message });
    }
  };
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/config", (_req, res) => res.json({ feeBps: FEE_BPS, feesWallet: FEES_WALLET.toBase58(), reownProjectId: REOWN_PROJECT_ID }));

app.get("/api/scan/tokens/:owner", handler((req) => scanTokens(parseOwner(req.params.owner))));
app.get("/api/scan/nfts/:owner", handler(async (req) => ({ nfts: await scanNfts(parseOwner(req.params.owner)) })));
app.get("/api/scan/rewards/:owner", handler(async (req) => ({ rewards: await scanRewards(parseOwner(req.params.owner)) })));

/** The claim list mixes pump.fun reward ids with token account addresses. */
async function buildClaim(owner: PublicKey, ids: string[]) {
  const rewardIds = ids.filter(isRewardId);
  const accounts = ids.filter((id) => !isRewardId(id));
  const transactions: Awaited<ReturnType<typeof buildClaimTransactions>> = [];
  if (rewardIds.length) {
    try {
      // Rewards go in their own transaction so a failing vault can't block the account closes
      transactions.push(...(await buildRewardTransactions(owner, rewardIds)));
    } catch (e) {
      if (!accounts.length) throw e;
      console.warn("[api] reward claim skipped:", (e as Error).message);
    }
  }
  if (accounts.length) transactions.push(...(await buildClaimTransactions(owner, accounts)));
  return transactions;
}

app.post("/api/build/claim", handler(async (req) => ({
  transactions: await buildClaim(parseOwner(req.body.owner), selection(req.body.accounts)),
})));
app.post("/api/build/burn-tokens", handler(async (req) => ({
  transactions: await buildBurnTransactions(parseOwner(req.body.owner), selection(req.body.accounts)),
})));
app.post("/api/build/burn-nfts", handler(async (req) => ({
  transactions: await buildNftBurnTransactions(parseOwner(req.body.owner), selection(req.body.ids)),
})));

app.post("/api/send", handler(async (req) => {
  const txs = selection(req.body.transactions);
  const signatures: (string | null)[] = [];
  const errors: string[] = [];
  for (const b64 of txs) {
    try {
      signatures.push(await connection.sendRawTransaction(Buffer.from(b64, "base64"), { maxRetries: 5 }));
    } catch (e) {
      signatures.push(null);
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { signatures, errors };
}));

app.post("/api/status", handler(async (req) => {
  const sigs = selection(req.body.signatures);
  const { value } = await connection.getSignatureStatuses(sigs, { searchTransactionHistory: false });
  return {
    statuses: value.map((s) => ({
      confirmed: !!s && !s.err && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized"),
      failed: !!s?.err,
    })),
  };
}));

async function start() {
  const port = Number(process.env.PORT || 5000);
  if (process.env.NODE_ENV === "development") {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const publicDir = path.resolve(import.meta.dirname, "public");
    if (!fs.existsSync(publicDir)) throw new Error(`Missing ${publicDir} - run npm run build first`);
    // Hashed assets never change, but index.html must be re-fetched so a new
    // deploy reaches open browsers instead of them running the previous build.
    app.use(
      express.static(publicDir, {
        setHeaders: (res, filePath) => {
          const cache = filePath.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable";
          res.setHeader("Cache-Control", cache);
        },
      }),
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }
  app.listen(port, "0.0.0.0", () => console.log(`GetFreeSol running on port ${port}`));
}

start();

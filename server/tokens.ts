import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createBurnCheckedInstruction } from "@solana/spl-token";
import { connection, GFS_PROGRAM_ID, heliusRpc } from "./config";
import { packTransactions, type IxGroup } from "./pack";

// Anchor discriminators of the GetFreeSol program instructions
const IX_CLOSE_SPL = Buffer.from("4b33be8144d741c4", "hex"); // close_spl_account
const IX_CLOSE_2022 = Buffer.from("b74836d03225c59d", "hex"); // close_token2022_account
const IX_BURN_SPL = Buffer.from("045a067e9372bc0a", "hex"); // burn_spl_token(amount: u64)

export interface TokenAccountInfo {
  address: string;
  mint: string;
  program: "spl" | "token2022";
  amount: string;
  decimals: number;
  uiAmount: number;
  lamports: number;
  name: string;
  symbol: string;
  image: string | null;
  usdValue: number | null;
}

interface ParsedAccount {
  pubkey: PublicKey;
  lamports: number;
  program: "spl" | "token2022";
  info: any;
}

function closeIx(owner: PublicKey, account: PublicKey, program: "spl" | "token2022") {
  return new TransactionInstruction({
    programId: GFS_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: program === "spl" ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: program === "spl" ? IX_CLOSE_SPL : IX_CLOSE_2022,
  });
}

function burnSplIx(owner: PublicKey, mint: PublicKey, account: PublicKey, amount: bigint) {
  const data = Buffer.alloc(16);
  IX_BURN_SPL.copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  return new TransactionInstruction({
    programId: GFS_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Why an account can't be closed by its owner, or null if it can. */
function blockReason(acc: ParsedAccount, owner: PublicKey): string | null {
  const info = acc.info;
  if (info.owner !== owner.toBase58()) return "not owned by wallet";
  if (info.state === "frozen") return "frozen";
  if (info.closeAuthority && info.closeAuthority !== owner.toBase58()) return "close authority is someone else";
  for (const ext of info.extensions || []) {
    if (ext.extension === "transferFeeAmount" && BigInt(ext.state?.withheldAmount ?? 0) > 0n) {
      return "has withheld transfer fees";
    }
  }
  return null;
}

async function fetchOwnerAccounts(owner: PublicKey): Promise<ParsedAccount[]> {
  const [spl, t22] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  const map = (list: typeof spl.value, program: "spl" | "token2022") =>
    list.map((a) => ({ pubkey: a.pubkey, lamports: a.account.lamports, program, info: (a.account.data as any).parsed.info }));
  return [...map(spl.value, "spl"), ...map(t22.value, "token2022")];
}

async function fetchSelected(owner: PublicKey, addresses: string[]): Promise<ParsedAccount[]> {
  const keys = addresses.map((a) => new PublicKey(a));
  const out: ParsedAccount[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const infos = await connection.getMultipleParsedAccounts(chunk, { commitment: "confirmed" });
    infos.value.forEach((acc, j) => {
      if (!acc || !("parsed" in (acc.data as any))) return;
      let program: "spl" | "token2022";
      if (acc.owner.equals(TOKEN_PROGRAM_ID)) program = "spl";
      else if (acc.owner.equals(TOKEN_2022_PROGRAM_ID)) program = "token2022";
      else return;
      const parsed = (acc.data as any).parsed;
      if (parsed.type !== "account") return;
      out.push({ pubkey: chunk[j], lamports: acc.lamports, program, info: parsed.info });
    });
  }
  return out.filter((a) => blockReason(a, owner) === null);
}

async function fetchTokenMetadata(mints: string[]) {
  const meta = new Map<string, { name: string; symbol: string; image: string | null; price: number | null }>();
  const unique = Array.from(new Set(mints));
  for (let i = 0; i < unique.length; i += 1000) {
    try {
      const assets = await heliusRpc<any[]>("getAssetBatch", { ids: unique.slice(i, i + 1000) });
      for (const a of assets || []) {
        if (!a) continue;
        meta.set(a.id, {
          name: a.content?.metadata?.name || a.token_info?.symbol || "",
          symbol: a.content?.metadata?.symbol || a.token_info?.symbol || "",
          image: a.content?.links?.image || a.content?.files?.[0]?.cdn_uri || a.content?.files?.[0]?.uri || null,
          price: a.token_info?.price_info?.price_per_token ?? null,
        });
      }
    } catch (e) {
      console.warn("[tokens] metadata lookup failed:", (e as Error).message);
    }
  }
  return meta;
}

export async function scanTokens(owner: PublicKey) {
  const accounts = (await fetchOwnerAccounts(owner)).filter((a) => blockReason(a, owner) === null);
  const meta = await fetchTokenMetadata(accounts.map((a) => a.info.mint));

  const toInfo = (a: ParsedAccount): TokenAccountInfo => {
    const m = meta.get(a.info.mint);
    const ta = a.info.tokenAmount;
    const uiAmount = Number(ta.uiAmountString ?? ta.uiAmount ?? 0);
    return {
      address: a.pubkey.toBase58(),
      mint: a.info.mint,
      program: a.program,
      amount: ta.amount,
      decimals: ta.decimals,
      uiAmount,
      lamports: a.lamports,
      name: m?.name || "Unknown token",
      symbol: m?.symbol || a.info.mint.slice(0, 4),
      image: m?.image || null,
      usdValue: m?.price != null ? m.price * uiAmount : null,
    };
  };

  const empty: TokenAccountInfo[] = [];
  const burnable: TokenAccountInfo[] = [];
  for (const a of accounts) {
    const ta = a.info.tokenAmount;
    if (ta.amount === "0") empty.push(toInfo(a));
    // decimals 0 + amount 1 are NFTs (NFT tab); wrapped SOL can't be burned
    else if (!(ta.decimals === 0 && ta.amount === "1") && a.info.mint !== NATIVE_MINT.toBase58()) burnable.push(toInfo(a));
  }
  burnable.sort((x, y) => (x.usdValue ?? 0) - (y.usdValue ?? 0));
  return { empty, burnable };
}

export async function buildClaimTransactions(owner: PublicKey, addresses: string[]) {
  const accounts = (await fetchSelected(owner, addresses)).filter((a) => a.info.tokenAmount.amount === "0");
  const groups: IxGroup[] = accounts.map((a) => ({
    id: a.pubkey.toBase58(),
    instructions: [closeIx(owner, a.pubkey, a.program)],
    reclaimLamports: a.lamports,
    computeUnits: 10_000,
  }));
  return packTransactions(owner, groups);
}

export async function buildBurnTransactions(owner: PublicKey, addresses: string[]) {
  const accounts = (await fetchSelected(owner, addresses)).filter(
    (a) => a.info.tokenAmount.amount !== "0" && a.info.mint !== NATIVE_MINT.toBase58(),
  );
  const groups: IxGroup[] = accounts.map((a) => {
    const mint = new PublicKey(a.info.mint);
    const amount = BigInt(a.info.tokenAmount.amount);
    const instructions =
      a.program === "spl"
        ? [burnSplIx(owner, mint, a.pubkey, amount)]
        : [
            createBurnCheckedInstruction(a.pubkey, mint, owner, amount, a.info.tokenAmount.decimals, [], TOKEN_2022_PROGRAM_ID),
            closeIx(owner, a.pubkey, "token2022"),
          ];
    return { id: a.pubkey.toBase58(), instructions, reclaimLamports: a.lamports, computeUnits: 20_000 };
  });
  return packTransactions(owner, groups);
}

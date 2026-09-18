import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from "@solana/spl-token";
import { connection } from "./config";
import { packTransactions, type IxGroup } from "./pack";

// Pump.fun programs. Both pay out through permissionless "crank" instructions:
// the reward always goes to the wallet the vault belongs to, whoever sends the transaction.
const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_AMM_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

// Anchor discriminators from the official pump IDLs (github.com/pump-fun/pump-public-docs)
const IX_CLAIM_CASHBACK = Buffer.from("253a237ebe35e4c5", "hex"); // claim_cashback (pump and pump_amm)
const IX_COLLECT_CREATOR_FEE = Buffer.from("1416567bc61cdb84", "hex"); // collect_creator_fee (pump)
const IX_COLLECT_COIN_CREATOR_FEE = Buffer.from("a039592ab58b2b42", "hex"); // collect_coin_creator_fee (pump_amm)

// Below this a claim costs more in network fees than it pays out
const MIN_CLAIM_LAMPORTS = 10_000;

export type RewardId = "pump-cashback" | "pump-creator" | "pumpswap-cashback" | "pumpswap-creator";

export interface RewardInfo {
  id: RewardId;
  label: string;
  description: string;
  lamports: number;
}

const pda = (seeds: (Buffer | Uint8Array)[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0];

const eventAuthority = (program: PublicKey) => pda([Buffer.from("__event_authority")], program);

/** Cashback vault for a trader: native lamports on pump, a WSOL account on PumpSwap. */
const volumeAccumulator = (owner: PublicKey, program: PublicKey) =>
  pda([Buffer.from("user_volume_accumulator"), owner.toBuffer()], program);

/** Creator fee vaults. Note the different seeds: pump uses a hyphen, PumpSwap an underscore. */
const creatorVault = (owner: PublicKey) => pda([Buffer.from("creator-vault"), owner.toBuffer()], PUMP_PROGRAM);
const coinCreatorVaultAuthority = (owner: PublicKey) =>
  pda([Buffer.from("creator_vault"), owner.toBuffer()], PUMP_AMM_PROGRAM);

const wsolAccountOf = (authority: PublicKey) => getAssociatedTokenAddressSync(NATIVE_MINT, authority, true);

function addresses(owner: PublicKey) {
  const ammCashbackVault = volumeAccumulator(owner, PUMP_AMM_PROGRAM);
  const ammCreatorAuthority = coinCreatorVaultAuthority(owner);
  return {
    pumpCashbackVault: volumeAccumulator(owner, PUMP_PROGRAM),
    pumpCreatorVault: creatorVault(owner),
    ammCashbackVault,
    ammCashbackWsol: wsolAccountOf(ammCashbackVault),
    ammCreatorAuthority,
    ammCreatorWsol: wsolAccountOf(ammCreatorAuthority),
    ownerWsol: getAssociatedTokenAddressSync(NATIVE_MINT, owner),
  };
}

/** Lamports a native vault can pay out: everything above what keeps the account rent exempt. */
async function nativeClaimable(account: { lamports: number; data: Buffer } | null): Promise<number> {
  if (!account) return 0;
  const rentExempt = await connection.getMinimumBalanceForRentExemption(account.data.length);
  return Math.max(0, account.lamports - rentExempt);
}

/** Unclaimed pump.fun rewards for a wallet: trading cashback and coin creator fees. */
export async function scanRewards(owner: PublicKey): Promise<RewardInfo[]> {
  const a = addresses(owner);
  const [pumpCashback, pumpCreator, ammCashbackWsol, ammCreatorWsol] = await connection.getMultipleAccountsInfo(
    [a.pumpCashbackVault, a.pumpCreatorVault, a.ammCashbackWsol, a.ammCreatorWsol],
    "confirmed",
  );

  const wsolBalance = (info: typeof ammCashbackWsol, address: PublicKey) => {
    if (!info) return 0;
    try {
      return Number(unpackAccount(address, info, info.owner).amount);
    } catch {
      return 0;
    }
  };

  const found: RewardInfo[] = [
    {
      id: "pump-cashback",
      label: "Pump.fun Cashback",
      description: "Fees paid back to you on bonding curve trades",
      lamports: await nativeClaimable(pumpCashback),
    },
    {
      id: "pump-creator",
      label: "Pump.fun Creator Fees",
      description: "Your share of trading fees on coins you created",
      lamports: await nativeClaimable(pumpCreator),
    },
    {
      id: "pumpswap-cashback",
      label: "PumpSwap Cashback",
      description: "Fees paid back to you on PumpSwap trades",
      lamports: wsolBalance(ammCashbackWsol, a.ammCashbackWsol),
    },
    {
      id: "pumpswap-creator",
      label: "PumpSwap Creator Fees",
      description: "Creator fees from your coins trading on PumpSwap",
      lamports: wsolBalance(ammCreatorWsol, a.ammCreatorWsol),
    },
  ];
  return found.filter((r) => r.lamports >= MIN_CLAIM_LAMPORTS);
}

function claimCashbackIx(owner: PublicKey, vault: PublicKey) {
  return new TransactionInstruction({
    programId: PUMP_PROGRAM,
    keys: [
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: eventAuthority(PUMP_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: IX_CLAIM_CASHBACK,
  });
}

function collectCreatorFeeIx(owner: PublicKey, vault: PublicKey) {
  return new TransactionInstruction({
    programId: PUMP_PROGRAM,
    keys: [
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: eventAuthority(PUMP_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: IX_COLLECT_CREATOR_FEE,
  });
}

function ammClaimCashbackIx(owner: PublicKey, vault: PublicKey, vaultWsol: PublicKey, ownerWsol: PublicKey) {
  return new TransactionInstruction({
    programId: PUMP_AMM_PROGRAM,
    keys: [
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: NATIVE_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: vaultWsol, isSigner: false, isWritable: true },
      { pubkey: ownerWsol, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: eventAuthority(PUMP_AMM_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: PUMP_AMM_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: IX_CLAIM_CASHBACK,
  });
}

function ammCollectCreatorFeeIx(owner: PublicKey, authority: PublicKey, vaultWsol: PublicKey, ownerWsol: PublicKey) {
  return new TransactionInstruction({
    programId: PUMP_AMM_PROGRAM,
    keys: [
      { pubkey: NATIVE_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: vaultWsol, isSigner: false, isWritable: true },
      { pubkey: ownerWsol, isSigner: false, isWritable: true },
      { pubkey: eventAuthority(PUMP_AMM_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: PUMP_AMM_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: IX_COLLECT_COIN_CREATOR_FEE,
  });
}

export async function buildRewardTransactions(owner: PublicKey, requested: string[]) {
  const wanted = new Set(requested);
  const available = new Map((await scanRewards(owner)).map((r) => [r.id, r]));
  const claim = (id: RewardId) => wanted.has(id) && available.has(id);
  const a = addresses(owner);

  const groups: IxGroup[] = [];
  if (claim("pump-cashback")) {
    groups.push({
      id: "pump-cashback",
      instructions: [claimCashbackIx(owner, a.pumpCashbackVault)],
      reclaimLamports: null, // measured by simulation
      computeUnits: 40_000,
    });
  }
  if (claim("pump-creator")) {
    groups.push({
      id: "pump-creator",
      instructions: [collectCreatorFeeIx(owner, a.pumpCreatorVault)],
      reclaimLamports: null,
      computeUnits: 40_000,
    });
  }

  // PumpSwap pays in wrapped SOL, so both of its rewards share one temporary WSOL account
  // that is created up front and closed at the end to unwrap everything into the wallet.
  const ammIds: RewardId[] = [];
  const ammInstructions: TransactionInstruction[] = [];
  if (claim("pumpswap-cashback")) {
    ammIds.push("pumpswap-cashback");
    ammInstructions.push(ammClaimCashbackIx(owner, a.ammCashbackVault, a.ammCashbackWsol, a.ownerWsol));
  }
  if (claim("pumpswap-creator")) {
    ammIds.push("pumpswap-creator");
    ammInstructions.push(ammCollectCreatorFeeIx(owner, a.ammCreatorAuthority, a.ammCreatorWsol, a.ownerWsol));
  }
  if (ammInstructions.length) {
    // Only unwrap an account we opened ourselves - an existing WSOL balance is left untouched.
    const ownerWsolExists = (await connection.getAccountInfo(a.ownerWsol, "confirmed")) !== null;
    const instructions = [
      createAssociatedTokenAccountIdempotentInstruction(owner, a.ownerWsol, owner, NATIVE_MINT),
      ...ammInstructions,
      ...(ownerWsolExists ? [] : [createCloseAccountInstruction(a.ownerWsol, owner, owner)]),
    ];
    groups.push({
      id: ammIds.join("+"),
      ids: ammIds,
      instructions,
      reclaimLamports: null,
      computeUnits: 60_000 + ammInstructions.length * 40_000,
    });
  }

  if (groups.length === 0) throw new Error("Nothing left to claim - try refreshing");
  try {
    // Everything in one transaction, so it costs a single network fee
    return await packTransactions(owner, groups, groups.length);
  } catch (e) {
    if (groups.length === 1) throw e;
    // One reward failing simulation takes the whole batch down - retry them separately
    console.warn(`[rewards] combined claim failed (${(e as Error).message}), falling back to one per transaction`);
    return packTransactions(owner, groups, 1);
  }
}

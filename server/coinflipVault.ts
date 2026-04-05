import { Keypair, Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from '@solana/web3.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import bs58 from 'bs58';

const VAULT_KEY_FILE = join(process.cwd(), '.coinflip_vault_key');

let vaultKeypair: Keypair | null = null;

function loadOrCreateVault(): Keypair {
  if (vaultKeypair) return vaultKeypair;

  // Prefer RELAYER_PRIVATE_KEY env var (new vault wallet)
  if (process.env.RELAYER_PRIVATE_KEY) {
    const secretKey = bs58.decode(process.env.RELAYER_PRIVATE_KEY);
    vaultKeypair = Keypair.fromSecretKey(secretKey);
    console.log(`🎰 Coin flip vault loaded from env: ${vaultKeypair.publicKey.toBase58()}`);
    return vaultKeypair;
  }

  if (existsSync(VAULT_KEY_FILE)) {
    const keyData = readFileSync(VAULT_KEY_FILE, 'utf-8').trim();
    const secretKey = bs58.decode(keyData);
    vaultKeypair = Keypair.fromSecretKey(secretKey);
    console.log(`🎰 Coin flip vault loaded: ${vaultKeypair.publicKey.toBase58()}`);
  } else {
    vaultKeypair = Keypair.generate();
    const encoded = bs58.encode(vaultKeypair.secretKey);
    writeFileSync(VAULT_KEY_FILE, encoded, { mode: 0o600 });
    console.log(`🎰 Coin flip vault created: ${vaultKeypair.publicKey.toBase58()}`);
    console.log(`💰 Fund this wallet with SOL to enable payouts!`);
  }

  return vaultKeypair;
}

export function getVaultKeypair(): Keypair {
  return loadOrCreateVault();
}

export function getVaultAddress(): string {
  return loadOrCreateVault().publicKey.toBase58();
}

export function getVaultPrivateKey(): string {
  const keypair = loadOrCreateVault();
  return bs58.encode(keypair.secretKey);
}

function getConnection(): Connection {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error('HELIUS_API_KEY is required');
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  return new Connection(rpcUrl, 'confirmed');
}

export async function getVaultBalance(): Promise<number> {
  const keypair = loadOrCreateVault();
  const connection = getConnection();
  const balance = await connection.getBalance(keypair.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

export async function withdrawFromVault(destinationAddress: string, amountSOL: number): Promise<string> {
  const keypair = loadOrCreateVault();
  const connection = getConnection();

  const balance = await connection.getBalance(keypair.publicKey);
  const lamportsToSend = Math.floor(amountSOL * LAMPORTS_PER_SOL);

  const estimatedFee = 5000;
  if (lamportsToSend + estimatedFee > balance) {
    throw new Error(`Insufficient vault balance. Have ${balance / LAMPORTS_PER_SOL} SOL, need ${amountSOL} SOL + fees`);
  }

  const destination = new PublicKey(destinationAddress);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: destination,
      lamports: lamportsToSend,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
  console.log(`🎰 Vault withdrawal: ${amountSOL} SOL → ${destinationAddress} (tx: ${signature})`);
  return signature;
}

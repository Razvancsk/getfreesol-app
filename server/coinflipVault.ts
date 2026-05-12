import { Keypair, Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import bs58 from 'bs58';

const ENV_PATH = join(process.cwd(), '.env');

function readEnvKey(name: string): string | undefined {
  try {
    const lines = readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith(name + '=')) {
        return trimmed.slice(name.length + 1).trim();
      }
    }
  } catch {}
  return undefined;
}

let vaultKeypair: Keypair | null = null;

function loadVault(): Keypair {
  if (vaultKeypair) return vaultKeypair;

  const key = readEnvKey('COINFLIP_VAULT_KEY') || readEnvKey('RELAYER_PRIVATE_KEY');
  if (!key) throw new Error('COINFLIP_VAULT_KEY is not set in .env');

  vaultKeypair = Keypair.fromSecretKey(bs58.decode(key));
  console.log(`🎰 Coin flip vault loaded: ${vaultKeypair.publicKey.toBase58()}`);
  return vaultKeypair;
}

export function getVaultKeypair(): Keypair {
  return loadVault();
}

export function getVaultAddress(): string {
  return loadVault().publicKey.toBase58();
}

export function getVaultPrivateKey(): string {
  return bs58.encode(loadVault().secretKey);
}

function getConnection(): Connection {
  const apiKey = readEnvKey('HELIUS_API_KEY') || process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error('HELIUS_API_KEY is required');
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, 'confirmed');
}

export async function getVaultBalance(): Promise<number> {
  const keypair = loadVault();
  const connection = getConnection();
  const balance = await connection.getBalance(keypair.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

export async function withdrawFromVault(destinationAddress: string, amountSOL: number): Promise<string> {
  const keypair = loadVault();
  const connection = getConnection();

  const balance = await connection.getBalance(keypair.publicKey);
  const lamportsToSend = Math.floor(amountSOL * LAMPORTS_PER_SOL);

  if (lamportsToSend + 5000 > balance) {
    throw new Error(`Insufficient vault balance. Have ${balance / LAMPORTS_PER_SOL} SOL, need ${amountSOL} SOL + fees`);
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(destinationAddress),
      lamports: lamportsToSend,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
  console.log(`🎰 Vault payout: ${amountSOL} SOL → ${destinationAddress} (tx: ${signature})`);
  return signature;
}

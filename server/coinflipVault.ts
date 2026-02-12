import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import bs58 from 'bs58';

const VAULT_KEY_FILE = join(process.cwd(), '.coinflip_vault_key');

let vaultKeypair: Keypair | null = null;

function loadOrCreateVault(): Keypair {
  if (vaultKeypair) return vaultKeypair;

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

export async function getVaultBalance(): Promise<number> {
  const keypair = loadOrCreateVault();
  const rpcUrl = process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const balance = await connection.getBalance(keypair.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

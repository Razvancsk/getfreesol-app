import { Connection, PublicKey, Transaction, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { Program, AnchorProvider, Idl, Wallet } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';
import { Keypair } from '@solana/web3.js';

// Kamino kVault constants for CASH
const KVAULT_CASH_ADDRESS = 'KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd'; // kVault CASH strategy
const CASH_MINT = 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH';
const KAMINO_VAULTS_PROGRAM_ID = 'Cyjb5r4P1j1YPEyUemWxMZKbTpBiyNQML1S1YpPvi9xE';

// Load IDL
function loadKaminoIdl(): Idl {
  const idlPath = path.join(process.cwd(), 'programs', 'kamino', 'klend-idl.json');
  const idlJson = fs.readFileSync(idlPath, 'utf-8');
  return JSON.parse(idlJson) as Idl;
}

// Get strategy state from on-chain
async function getStrategyState(connection: Connection, strategyPubkey: PublicKey) {
  const accountInfo = await connection.getAccountInfo(strategyPubkey);
  if (!accountInfo) {
    throw new Error('Strategy account not found');
  }
  return accountInfo;
}

// Build Kamino kVault deposit instruction
export async function buildKaminoDepositTransaction(
  connection: Connection,
  userPubkey: PublicKey,
  amount: number // in lamports (CASH has 6 decimals)
): Promise<string> {
  console.log('🏗️  Building real Kamino kVault deposit transaction...');
  console.log(`📍 User: ${userPubkey.toBase58()}`);
  console.log(`📍 Amount: ${amount / 1_000_000} CASH`);
  
  const strategyPubkey = new PublicKey(KVAULT_CASH_ADDRESS);
  const cashMint = new PublicKey(CASH_MINT);
  const programId = new PublicKey(KAMINO_VAULTS_PROGRAM_ID);
  
  // Load IDL and create program
  const idl = loadKaminoIdl();
  const dummyWallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(connection, dummyWallet, {});
  const program = new Program(idl, programId, provider);
  
  console.log('✅ Loaded Kamino vaults program from IDL');
  
  // Fetch strategy state to get all PDAs
  const strategyData = await getStrategyState(connection, strategyPubkey);
  console.log('✅ Fetched strategy state');
  
  // Get user's CASH ATA (Token-2022)
  const userCashAta = await getAssociatedTokenAddress(
    cashMint,
    userPubkey,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Get user's shares ATA (kToken - this is the receipt token)
  // We need to find the shares mint from the strategy account
  // For now, we'll derive it - the shares mint is a PDA of the strategy
  const [sharesMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('shares_mint'), strategyPubkey.toBuffer()],
    programId
  );
  
  const userSharesAta = await getAssociatedTokenAddress(
    sharesMint,
    userPubkey,
    true,
    TOKEN_PROGRAM_ID
  );
  
  // Derive other required PDAs
  const [baseVaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('base_vault_authority'), strategyPubkey.toBuffer()],
    programId
  );
  
  const [sharesMintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('shares_mint_authority'), strategyPubkey.toBuffer()],
    programId
  );
  
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('global_config')],
    programId
  );
  
  // Token vaults (where the CASH is stored in the strategy)
  const [tokenAVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_a_vault'), strategyPubkey.toBuffer()],
    programId
  );
  
  const [tokenBVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_b_vault'), strategyPubkey.toBuffer()],
    programId
  );
  
  console.log('✅ Derived all PDAs');
  console.log(`📍 User CASH ATA: ${userCashAta.toBase58()}`);
  console.log(`📍 User Shares ATA: ${userSharesAta.toBase58()}`);
  console.log(`📍 Shares Mint: ${sharesMint.toBase58()}`);
  
  // Build transaction
  const tx = new Transaction();
  
  // Create shares ATA if needed
  const sharesAtaInfo = await connection.getAccountInfo(userSharesAta);
  if (!sharesAtaInfo) {
    console.log('📝 Creating user shares ATA...');
    tx.add(
      createAssociatedTokenAccountInstruction(
        userPubkey,
        userSharesAta,
        userPubkey,
        sharesMint,
        TOKEN_PROGRAM_ID
      )
    );
  }
  
  // Build deposit instruction using Anchor
  // Note: We need actual on-chain data to fill in pool, position, tickArrays, etc.
  // For now, we'll fetch these from the strategy state
  
  // This requires parsing the strategy account data to get:
  // - pool address
  // - position address  
  // - tick arrays
  // - scope prices
  // - token infos
  
  console.log('⚠️  Need to parse strategy account to get remaining accounts...');
  console.log('📍 Strategy data size:', strategyData.data.length);
  
  // For a complete implementation, we would:
  // 1. Deserialize the strategy account using the IDL
  // 2. Extract pool, position, and other addresses
  // 3. Build the full deposit instruction
  
  // This is where the SDK becomes necessary or we need to manually parse the account data
  throw new Error('Strategy account parsing required - need to extract pool, position, tickArrays from on-chain data');
}

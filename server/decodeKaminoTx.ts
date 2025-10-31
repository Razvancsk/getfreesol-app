import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Known transaction with deposit instruction
const EXAMPLE_TX = '5gdFycd5naLS6TiKciN8KjjsdUAvMVBhgcBtNd6iSgaqKN4B685BDwF8bDbfE5NoDdbDiNXyB7LPMRzseJjVhwQv';

async function decodeTransaction() {
  console.log('🔍 Decoding Kamino kVault transaction...');
  
  const connection = new Connection(RPC_URL);
  
  try {
    const tx = await connection.getTransaction(EXAMPLE_TX, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || !tx.transaction) {
      throw new Error('Transaction not found');
    }
    
    const message = tx.transaction.message;
    const accountKeys = message.staticAccountKeys;
    
    console.log(`\n✅ Full account list for transaction (${accountKeys.length} accounts):\n`);
    accountKeys.forEach((key, idx) => {
      console.log(`[${idx.toString().padStart(2, '0')}] ${key.toBase58()}`);
    });
    
    // Find the kVault instruction
    const instructions = message.compiledInstructions;
    const kVaultIx = instructions.find(ix => {
      const programKey = accountKeys[ix.programIdIndex];
      return programKey.toBase58() === 'KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd';
    });
    
    if (kVaultIx) {
      console.log(`\n📋 kVault Instruction Details:`);
      console.log(`  Program Index: [${kVaultIx.programIdIndex}]`);
      console.log(`  Data (hex): ${Buffer.from(kVaultIx.data).toString('hex')}`);
      console.log(`  Data (base64): ${Buffer.from(kVaultIx.data).toString('base64')}`);
      console.log(`\n  Account Indexes (${kVaultIx.accountKeyIndexes.length}):`);
      
      kVaultIx.accountKeyIndexes.forEach((idx, position) => {
        const key = accountKeys[idx];
        console.log(`    [${position.toString().padStart(2, '0')}] -> [${idx.toString().padStart(2, '0')}] ${key.toBase58()}`);
      });
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

decodeTransaction();

import { Connection, PublicKey } from '@solana/web3.js';

const KVAULT_CASH_ADDRESS = 'KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd';
const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function inspectKaminoTransactions() {
  console.log('🔍 Fetching recent transactions for Kamino kVault CASH...');
  
  const connection = new Connection(RPC_URL);
  const vaultPubkey = new PublicKey(KVAULT_CASH_ADDRESS);
  
  try {
    // Get recent signatures
    const signatures = await connection.getSignaturesForAddress(vaultPubkey, { limit: 10 });
    
    console.log(`📊 Found ${signatures.length} recent transactions`);
    
    for (const sig of signatures.slice(0, 3)) {
      console.log('\n' + '='.repeat(80));
      console.log(`📝 Transaction: ${sig.signature}`);
      console.log(`🕒 Block time: ${sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'N/A'}`);
      
      // Get transaction details
      const tx = await connection.getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (tx && tx.transaction) {
        const message = tx.transaction.message;
        const accountKeys = message.staticAccountKeys || message.getAccountKeys().staticAccountKeys;
        
        console.log(`\n📦 Accounts (${accountKeys.length}):`);
        accountKeys.forEach((key, idx) => {
          console.log(`  [${idx}] ${key.toBase58()}`);
        });
        
        // Check for deposit instruction
        const instructions = message.compiledInstructions;
        console.log(`\n⚙️  Instructions (${instructions.length}):`);
        instructions.forEach((ix, idx) => {
          console.log(`  [${idx}] Program: ${accountKeys[ix.programIdIndex].toBase58()}`);
          console.log(`       Accounts: ${ix.accountKeyIndexes.map(i => `[${i}]`).join(', ')}`);
          console.log(`       Data: ${Buffer.from(ix.data).toString('hex').slice(0, 32)}...`);
        });
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Inspection complete');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

inspectKaminoTransactions();

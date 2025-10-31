import { Connection, PublicKey } from '@solana/web3.js';
import { Kamino } from '@kamino-finance/kliquidity-sdk';
import Decimal from 'decimal.js';
import { applyKaminoRpcShim } from './kaminoRpcShim';

const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const KVAULT_CASH_ADDRESS = 'KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd';

async function testKaminoKliquidity() {
  console.log('🧪 Testing Kamino kLiquidity SDK with RPC shim...');
  
  try {
    let connection = new Connection(RPC_URL);
    connection = applyKaminoRpcShim(connection);
    console.log('✅ Applied Kamino RPC compatibility shim');
    
    const kamino = new Kamino('mainnet-beta', connection);
    
    console.log('✅ Created Kamino instance');
    
    // Try to get strategy
    const strategyPubkey = new PublicKey(KVAULT_CASH_ADDRESS);
    const strategy = await kamino.getStrategyByAddress(strategyPubkey);
    
    if (!strategy) {
      console.log('❌ Strategy not found');
      return;
    }
    
    console.log('✅ Successfully fetched strategy!');
    console.log('📊 Strategy details:');
    console.log('  Address:', strategyPubkey.toBase58());
    console.log('  SharesM mint:', strategy.sharesMint.toBase58());
    console.log('  Token A mint:', strategy.tokenAMint.toBase58());
    console.log('  Token B mint:', strategy.tokenBMint.toBase58());
    
    // Try to build deposit instruction
    const testUser = new PublicKey('11111111111111111111111111111112'); // dummy user
    console.log('\n🏗️  Testing deposit instruction building...');
    
    const depositIx = await kamino.deposit(
      strategy,
      new Decimal(1), // 1 token A
      new Decimal(0), // 0 token B (single-sided deposit)
      testUser
    );
    
    console.log('✅ Successfully built deposit instruction!');
    console.log('📋 Instruction details:');
    console.log('  Program ID:', depositIx.programId.toBase58());
    console.log('  Keys count:', depositIx.keys.length);
    console.log('  Data length:', depositIx.data.length);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
}

testKaminoKliquidity();

import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';

const KAMINO_KLEND_IDL_ADDRESS = '6LtLpnUFNByNXLyCoK9wA2MykKAmQNZKBdY8s47dehDc';
const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function fetchAndSaveIdl() {
  console.log('🔄 Fetching Kamino KLend IDL from on-chain...');
  
  const connection = new Connection(RPC_URL);
  
  try {
    // Fetch IDL from on-chain address
    const idl = await Program.fetchIdl(new PublicKey(KAMINO_KLEND_IDL_ADDRESS), {
      connection,
    } as any);
    
    if (!idl) {
      throw new Error('IDL not found on-chain');
    }
    
    // Create directory
    const dir = path.join(process.cwd(), 'programs', 'kamino');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Save IDL
    const filePath = path.join(dir, 'klend-idl.json');
    fs.writeFileSync(filePath, JSON.stringify(idl, null, 2));
    
    console.log('✅ Kamino KLend IDL saved to:', filePath);
    console.log('📊 Instructions found:', idl.instructions?.length || 0);
  } catch (error) {
    console.error('❌ Failed to fetch IDL:', error);
    throw error;
  }
}

fetchAndSaveIdl();

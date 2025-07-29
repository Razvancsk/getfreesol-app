// Manually add the found RKT address to database
// Address: 8QrEaiV8AuAxAdj3irjfuWJtFoGTpvrPkRzWyhrdmrkt

// Since we need the private key for this specific address, let me regenerate it
import { Keypair } from '@solana/web3.js';

console.log('Searching for the exact address: 8QrEaiV8AuAxAdj3irjfuWJtFoGTpvrPkRzWyhrdmrkt');

let attempts = 0;
while (true) {
  attempts++;
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toString();
  
  if (publicKey === '8QrEaiV8AuAxAdj3irjfuWJtFoGTpvrPkRzWyhrdmrkt') {
    const privateKeyArray = Array.from(keypair.secretKey);
    console.log('Found exact match!');
    console.log(`Private key: ${JSON.stringify(privateKeyArray)}`);
    console.log(`SQL: INSERT INTO vanity_addresses (public_key, private_key, suffix, is_used) VALUES ('${publicKey}', '${JSON.stringify(privateKeyArray)}', 'rkt', false);`);
    break;
  }
  
  if (attempts % 1000000 === 0) {
    console.log(`${attempts} attempts to find exact address...`);
  }
}
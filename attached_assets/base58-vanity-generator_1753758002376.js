import { Keypair } from '@solana/web3.js';

// Base58 character set (excludes 0, O, I, l to avoid confusion)
const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// More efficient Base58 vanity generator
class Base58VanityGenerator {
  constructor(suffix = 'rocket') {
    this.suffix = suffix;
    this.attempts = 0;
    this.startTime = Date.now();
    
    // Validate suffix contains only Base58 characters
    for (let char of suffix) {
      if (!BASE58_CHARS.includes(char)) {
        throw new Error(`Invalid character '${char}' in suffix. Must use Base58 characters only: ${BASE58_CHARS}`);
      }
    }
    
    console.log(`🎯 Target suffix: "${suffix}"`);
    console.log(`📊 Estimated attempts needed: ~${Math.pow(58, suffix.length).toLocaleString()}`);
  }

  generateVanityAddress() {
    while (true) {
      this.attempts++;
      
      // Generate new keypair
      const keypair = Keypair.generate();
      const publicKey = keypair.publicKey.toString();
      
      // Check if address ends with our suffix
      if (publicKey.endsWith(this.suffix)) {
        const privateKeyArray = Array.from(keypair.secretKey);
        return {
          publicKey,
          privateKey: privateKeyArray,
          attempts: this.attempts,
          timeElapsed: (Date.now() - this.startTime) / 1000
        };
      }
      
      // Log progress every 100k attempts
      if (this.attempts % 100000 === 0) {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const rate = this.attempts / elapsed;
        const estimatedTotal = Math.pow(58, this.suffix.length);
        const progress = (this.attempts / estimatedTotal * 100).toFixed(6);
        
        console.log(`🔄 Attempts: ${this.attempts.toLocaleString()}`);
        console.log(`⚡ Rate: ${Math.round(rate).toLocaleString()}/sec`);
        console.log(`📈 Progress: ${progress}%`);
        console.log(`⏱️  Elapsed: ${Math.round(elapsed)}s`);
        console.log('---');
      }
    }
  }

  // Generate multiple addresses
  generateMultiple(count = 1) {
    console.log(`🚀 Generating ${count} address(es) ending with "${this.suffix}"`);
    console.log(`⚠️  This may take time...\n`);

    const addresses = [];
    
    for (let i = 0; i < count; i++) {
      console.log(`\n🎯 Generating address ${i + 1}/${count}...`);
      console.log(`⏰ Started: ${new Date().toLocaleString()}`);
      
      this.attempts = 0;
      this.startTime = Date.now();
      
      const result = this.generateVanityAddress();
      
      addresses.push({
        publicKey: result.publicKey,
        privateKey: JSON.stringify(result.privateKey),
        suffix: this.suffix
      });
      
      console.log(`\n✅ SUCCESS!`);
      console.log(`📍 Address: ${result.publicKey}`);
      console.log(`🔢 Attempts: ${result.attempts.toLocaleString()}`);
      console.log(`⏱️  Time: ${Math.round(result.timeElapsed)}s`);
      console.log(`⚡ Rate: ${Math.round(result.attempts / result.timeElapsed).toLocaleString()}/sec`);
    }
    
    return addresses;
  }

  // Generate SQL for database insertion
  generateSQL(addresses) {
    if (addresses.length === 0) return '';
    
    console.log('\n📝 SQL INSERT statements:');
    console.log('INSERT INTO vanity_addresses (public_key, private_key, suffix) VALUES');
    
    const values = addresses.map(addr => 
      `('${addr.publicKey}', '${addr.privateKey}', '${addr.suffix}')`
    ).join(',\n');
    
    const sql = `INSERT INTO vanity_addresses (public_key, private_key, suffix) VALUES\n${values};`;
    console.log(sql);
    
    return sql;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const suffix = args[0] || 'rocket';
  const count = parseInt(args[1]) || 1;
  
  console.log('🚀 Base58 Solana Vanity Address Generator\n');
  
  try {
    const generator = new Base58VanityGenerator(suffix);
    const addresses = generator.generateMultiple(count);
    const sql = generator.generateSQL(addresses);
    
    console.log('\n🎉 Generation complete!');
    console.log('💾 Copy the SQL above to add these addresses to your database.');
    
    return addresses;
  } catch (error) {
    console.error('\n❌ Generation failed:', error.message);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { Base58VanityGenerator };
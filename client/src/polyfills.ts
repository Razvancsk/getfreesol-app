// Polyfills for browser compatibility with Solana web3.js
import { Buffer } from 'buffer';

// Add Buffer to global scope
(globalThis as any).Buffer = Buffer;
(globalThis as any).global = globalThis;

// Export for importing
export { Buffer };
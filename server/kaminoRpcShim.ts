import { Connection } from '@solana/web3.js';

/**
 * Kamino SDK compatibility shim
 * 
 * Problem: Kamino SDKs (@kamino-finance/klend-sdk and @kamino-finance/kliquidity-sdk)
 * expect legacy web3.js RPC API with .send() method:
 *   rpc.getAccountInfo(...).send()
 * 
 * Our @solana/web3.js returns Promises directly:
 *   await rpc.getAccountInfo(...) // No .send() method
 * 
 * Solution: Wrap the Connection to add .send() method to all RPC call returns
 */
export function applyKaminoRpcShim(connection: Connection): Connection {
  // Create proxy that wraps the entire connection
  const shimmedConnection = new Proxy(connection, {
    get(target: any, prop: string) {
      const original = target[prop];
      
      // Handle rpc property specifically
      if (prop === 'rpc') {
        if (!original || typeof original !== 'object') {
          // If rpc doesn't exist, create a shim that delegates to connection methods
          return new Proxy({}, {
            get(_, rpcMethod: string) {
              return function(...args: any[]) {
                // Delegate to the connection method directly
                const connectionMethod = (target as any)[rpcMethod];
                if (typeof connectionMethod === 'function') {
                  const result = connectionMethod.apply(target, args);
                  if (result && typeof result.then === 'function') {
                    (result as any).send = () => result;
                  }
                  return result;
                }
                return undefined;
              };
            }
          });
        }
        
        // If rpc exists, wrap it
        return new Proxy(original, {
          get(rpcTarget: any, rpcMethod: string) {
            const rpcOriginal = rpcTarget[rpcMethod];
            if (typeof rpcOriginal === 'function') {
              return function(...args: any[]) {
                const result = rpcOriginal.apply(rpcTarget, args);
                if (result && typeof result.then === 'function') {
                  (result as any).send = () => result;
                }
                return result;
              };
            }
            return rpcOriginal;
          }
        });
      }
      
      return original;
    }
  });
  
  return shimmedConnection;
}

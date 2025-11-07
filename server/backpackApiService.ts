import nacl from 'tweetnacl';

interface BackpackApiConfig {
  baseUrl: string;
  publicKey: string;
  privateKey: string;
}

class BackpackApiService {
  private config: BackpackApiConfig;
  private keyPair: nacl.SignKeyPair | null = null;

  constructor() {
    const privateKey = process.env.Backpack_api_secret || '';
    const publicKey = process.env.Backpack_api_key || '';
    
    // Initialize keypair from private key
    if (privateKey) {
      try {
        const keyBytes = Buffer.from(privateKey, 'base64');
        
        // Try as 32-byte seed first
        if (keyBytes.length === 32) {
          this.keyPair = nacl.sign.keyPair.fromSeed(keyBytes);
          console.log('✅ REST API: Keypair initialized from 32-byte seed');
        }
        // Try as 64-byte secret key
        else if (keyBytes.length === 64) {
          this.keyPair = nacl.sign.keyPair.fromSecretKey(keyBytes);
          console.log('✅ REST API: Keypair initialized from 64-byte secret key');
        }
        else {
          console.error(`❌ REST API: Invalid key length: ${keyBytes.length} bytes (expected 32 or 64)`);
        }
      } catch (error) {
        console.error('❌ REST API: Failed to initialize keypair:', error);
      }
    }
    
    this.config = {
      baseUrl: 'https://api.backpack.exchange',
      publicKey,
      privateKey,
    };
    
    if (this.isConfigured()) {
      console.log('✅ Backpack API credentials configured');
    } else {
      console.warn('⚠️ Backpack API credentials not configured');
    }
  }

  private generateSignature(
    instruction: string,
    params: Record<string, any>,
    timestamp: number,
    window: number = 5000
  ): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as Record<string, any>);

    const queryString = new URLSearchParams(sortedParams).toString();
    
    // Build signature payload correctly - don't add extra & when no params
    let signaturePayload = `instruction=${instruction}`;
    if (queryString) {
      signaturePayload += `&${queryString}`;
    }
    signaturePayload += `&timestamp=${timestamp}&window=${window}`;

    // Backpack private key is the seed (32 bytes)
    if (!this.keyPair) {
      const seedBytes = Buffer.from(this.config.privateKey, 'base64');
      this.keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
    }
    
    const messageBytes = new TextEncoder().encode(signaturePayload);
    const signature = nacl.sign.detached(messageBytes, this.keyPair.secretKey);

    return Buffer.from(signature).toString('base64');
  }

  async getBorrowLendMarkets(): Promise<any> {
    try {
      // Fetch both spot markets and lending markets
      const [marketsResponse, lendMarketsResponse] = await Promise.all([
        fetch(`${this.config.baseUrl}/api/v1/markets`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch(`${this.config.baseUrl}/api/v1/borrowLend/markets`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
      ]);

      if (!marketsResponse.ok) {
        const errorText = await marketsResponse.text();
        throw new Error(`Backpack markets API error: ${marketsResponse.status} - ${errorText}`);
      }

      const spotMarkets = await marketsResponse.json();
      const lendMarkets = lendMarketsResponse.ok ? await lendMarketsResponse.json() : [];
      
      // Create a map of lending data by symbol
      const lendingDataMap = new Map();
      lendMarkets.forEach((market: any) => {
        // Convert decimal rates to percentage (e.g., 0.0211 -> 2.11%)
        const lendRate = parseFloat(market.lendInterestRate || 0) * 100;
        const borrowRate = parseFloat(market.borrowInterestRate || 0) * 100;
        
        lendingDataMap.set(market.symbol, {
          lendApy: isNaN(lendRate) ? 0 : lendRate,
          borrowApy: isNaN(borrowRate) ? 0 : borrowRate,
          totalLiquidity: market.lentQuantity || '0',
          availableLiquidity: (parseFloat(market.lentQuantity || 0) - parseFloat(market.borrowedQuantity || 0)).toString(),
          utilization: parseFloat(market.utilization || 0),
          price: market.assetMarkPrice || '0',
        });
      });

      console.log(`📊 Backpack: ${spotMarkets.length} total markets, ${lendMarkets.length} with lending`);
      
      // Log sample market for verification
      if (lendMarkets.length > 0) {
        const sample = lendMarkets[0];
        const sampleData = lendingDataMap.get(sample.symbol);
        console.log(`   Sample: ${sample.symbol} - Lend APY: ${sampleData?.lendApy.toFixed(2)}%, Borrow APY: ${sampleData?.borrowApy.toFixed(2)}%`);
      }
      
      // Extract unique base symbols from spot markets
      const uniqueAssets = new Map();
      spotMarkets.forEach((market: any) => {
        const baseSymbol = market.baseSymbol;
        if (baseSymbol && !uniqueAssets.has(baseSymbol)) {
          uniqueAssets.set(baseSymbol, market);
        }
      });

      // Transform to our format
      return Array.from(uniqueAssets.values()).map((market: any) => {
        const symbol = market.baseSymbol;
        const lendingData = lendingDataMap.get(symbol);
        
        return {
          asset: symbol,
          symbol: symbol,
          depositAPY: lendingData ? lendingData.lendApy : 0,
          borrowApy: lendingData ? lendingData.borrowApy : 0,
          totalLiquidity: lendingData ? lendingData.totalLiquidity : '0',
          availableLiquidity: lendingData ? lendingData.availableLiquidity : '0',
          utilizationRate: lendingData ? lendingData.utilization : 0,
          decimals: 9,
          price: lendingData ? lendingData.price : '0',
          utilization: lendingData ? lendingData.utilization : 0,
          lentQuantity: lendingData ? lendingData.totalLiquidity : '0',
          borrowedQuantity: '0',
          hasLending: !!lendingData,
          marketType: market.marketType,
          orderBookState: market.orderBookState,
        };
      });
    } catch (error) {
      console.error('Failed to fetch borrow/lend markets:', error);
      throw error;
    }
  }

  async getBalances(): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const instruction = 'balanceQuery';
      const signature = this.generateSignature(instruction, {}, timestamp, window);

      const response = await fetch(`${this.config.baseUrl}/api/v1/capital`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Timestamp': timestamp.toString(),
          'X-Window': window.toString(),
          'X-API-Key': this.config.publicKey,
          'X-Signature': signature,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backpack API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch balances:', error);
      throw error;
    }
  }

  async getCollateral(): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const instruction = 'collateralQuery';
      const signature = this.generateSignature(instruction, {}, timestamp, window);

      const response = await fetch(`${this.config.baseUrl}/api/v1/capital/collateral`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Timestamp': timestamp.toString(),
          'X-Window': window.toString(),
          'X-API-Key': this.config.publicKey,
          'X-Signature': signature,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backpack API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch collateral:', error);
      throw error;
    }
  }

  async getBorrowLendPositions(): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const instruction = 'borrowLendPositionQuery';
      const signature = this.generateSignature(instruction, {}, timestamp, window);

      console.log(`🔐 REST API Debug:
   Endpoint: /api/v1/borrowLend/positions
   Instruction: ${instruction}
   Timestamp: ${timestamp}
   Public Key: ${this.config.publicKey}
   Signature (first 20 chars): ${signature.substring(0, 20)}...`);

      const response = await fetch(`${this.config.baseUrl}/api/v1/borrowLend/positions`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Timestamp': timestamp.toString(),
          'X-Window': window.toString(),
          'X-API-Key': this.config.publicKey,
          'X-Signature': signature,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backpack API error: ${response.status} - ${errorText}`);
      }

      const positions = await response.json();
      console.log(`📊 Backpack returned ${positions.length || 0} borrow/lend positions`);
      
      // Transform Backpack positions to our format
      return (positions || []).map((position: any) => ({
        asset: position.symbol,
        symbol: position.symbol,
        amount: position.netQuantity || '0',
        shares: position.netQuantity || '0',
        decimals: 9,
        amountUSD: position.netExposureNotional || '0',
        apy: 0,
        jlTokenAddress: position.symbol,
        side: parseFloat(position.netQuantity || 0) > 0 ? 'lend' : 'borrow',
        cumulativeInterest: position.cumulativeInterest || '0',
        markPrice: position.markPrice || '0'
      }));
    } catch (error) {
      console.error('Failed to fetch borrow/lend positions:', error);
      throw error;
    }
  }

  async executeBorrowLend(params: {
    symbol: string;
    side: 'Lend' | 'Borrow' | 'Repay' | 'Withdraw';
    quantity: string;
  }): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const signature = this.generateSignature('borrowLendExecute', params, timestamp, window);

      const response = await fetch(`${this.config.baseUrl}/api/v1/borrowLend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Timestamp': timestamp.toString(),
          'X-Window': window.toString(),
          'X-API-Key': this.config.publicKey,
          'X-Signature': signature,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backpack API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to execute borrow/lend:', error);
      throw error;
    }
  }

  async getEstimatedLiquidationPrice(params: {
    symbol: string;
    side: 'Lend' | 'Borrow';
    quantity: string;
  }): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const signature = this.generateSignature('borrowLendLiquidationPrice', params, timestamp, window);
      
      const queryParams = new URLSearchParams(params as any).toString();
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/borrowLend/liquidationPrice?${queryParams}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Timestamp': timestamp.toString(),
            'X-Window': window.toString(),
            'X-API-Key': this.config.publicKey,
            'X-Signature': signature,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backpack API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get estimated liquidation price:', error);
      throw error;
    }
  }

  async getBorrowHistory(params?: { symbol?: string }): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const signature = this.generateSignature('borrowHistoryQueryAll', params || {}, timestamp, window);
      
      const queryParams = params ? `?${new URLSearchParams(params as any).toString()}` : '';
      const response = await fetch(
        `${this.config.baseUrl}/history/borrowLend${queryParams}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Timestamp': timestamp.toString(),
            'X-Window': window.toString(),
            'X-API-Key': this.config.publicKey,
            'X-Signature': signature,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backpack API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch borrow history:', error);
      throw error;
    }
  }

  async getInterestHistory(params?: { symbol?: string }): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const signature = this.generateSignature('interestHistoryQueryAll', params || {}, timestamp, window);
      
      const queryParams = params ? `?${new URLSearchParams(params as any).toString()}` : '';
      const response = await fetch(
        `${this.config.baseUrl}/history/interest${queryParams}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Timestamp': timestamp.toString(),
            'X-Window': window.toString(),
            'X-API-Key': this.config.publicKey,
            'X-Signature': signature,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backpack API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch interest history:', error);
      throw error;
    }
  }

  async getMarketHistory(symbol?: string): Promise<any> {
    try {
      // Public endpoint - no authentication needed
      const queryParams = symbol ? `?symbol=${symbol}` : '';
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/borrowLend/marketHistory${queryParams}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backpack API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch market history:', error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return !!(this.config.publicKey && this.config.privateKey);
  }
}

export const backpackApiService = new BackpackApiService();
export default backpackApiService;

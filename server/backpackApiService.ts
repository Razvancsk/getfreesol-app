import nacl from 'tweetnacl';

interface BackpackApiConfig {
  baseUrl: string;
  publicKey: string;
  privateKey: string;
}

class BackpackApiService {
  private config: BackpackApiConfig;

  constructor() {
    this.config = {
      baseUrl: 'https://api.backpack.exchange',
      publicKey: process.env.BACKPACK_API_KEY || '',
      privateKey: process.env.BACKPACK_PRIVATE_KEY || '',
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
    const signaturePayload = `instruction=${instruction}&${queryString}&timestamp=${timestamp}&window=${window}`;

    // Backpack private key is the seed (32 bytes)
    const seedBytes = Buffer.from(this.config.privateKey, 'base64');
    const keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
    const messageBytes = new TextEncoder().encode(signaturePayload);
    const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);

    return Buffer.from(signature).toString('base64');
  }

  async getBorrowLendMarkets(): Promise<any> {
    try {
      // Public endpoint - no authentication needed
      const response = await fetch(`${this.config.baseUrl}/api/v1/borrowLend/markets`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backpack API error: ${response.status} - ${errorText}`);
      }

      const markets = await response.json();
      console.log(`📊 Backpack returned ${markets.length} borrow/lend markets`);
      
      // Transform to our format
      return markets.map((market: any) => ({
        asset: market.symbol,
        symbol: market.symbol,
        lendApy: parseFloat(market.lendInterestRate || 0),
        borrowApy: parseFloat(market.borrowInterestRate || 0),
        totalLiquidity: market.lentQuantity || '0',
        availableLiquidity: (parseFloat(market.lentQuantity || 0) - parseFloat(market.borrowedQuantity || 0)).toString(),
        utilizationRate: parseFloat(market.utilization || 0),
        decimals: 9,
        price: market.assetMarkPrice || '0',
        utilization: parseFloat(market.utilization || 0),
        lentQuantity: market.lentQuantity || '0',
        borrowedQuantity: market.borrowedQuantity || '0',
      }));
    } catch (error) {
      console.error('Failed to fetch borrow/lend markets:', error);
      throw error;
    }
  }

  async getBorrowLendPositions(): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const signature = this.generateSignature('balanceQuery', {}, timestamp, window);

      const response = await fetch(`${this.config.baseUrl}/wapi/v1/capital`, {
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

      const data = await response.json();
      
      // Transform balances to positions format
      const balances = data.balances || {};
      const positions = Object.entries(balances)
        .filter(([_, balance]: [string, any]) => parseFloat(balance.available || 0) > 0)
        .map(([asset, balance]: [string, any]) => ({
          asset,
          symbol: asset,
          amount: balance.available,
          shares: balance.available,
          decimals: 9,
          amountUSD: '0',
          apy: 5.0,
          jlTokenAddress: asset
        }));

      return positions;
    } catch (error) {
      console.error('Failed to fetch borrow/lend positions:', error);
      throw error;
    }
  }

  async executeBorrowLend(params: {
    asset: string;
    side: 'lend' | 'borrow';
    quantity: string;
  }): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const signature = this.generateSignature('borrowLendExecute', params, timestamp, window);

      const response = await fetch(`${this.config.baseUrl}/api/v1/capital/borrow-lend`, {
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
        throw new Error(`Backpack API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to execute borrow/lend:', error);
      throw error;
    }
  }

  async getEstimatedLiquidationPrice(params: {
    asset: string;
    side: 'lend' | 'borrow';
    quantity: string;
  }): Promise<any> {
    try {
      const queryParams = new URLSearchParams(params as any).toString();
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/capital/borrow-lend/position/estimatedLiquidationPrice?${queryParams}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Backpack API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get estimated liquidation price:', error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return !!(this.config.publicKey && this.config.privateKey);
  }
}

export const backpackApiService = new BackpackApiService();
export default backpackApiService;

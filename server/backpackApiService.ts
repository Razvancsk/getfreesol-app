import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64 } from 'tweetnacl-util';

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
      publicKey: process.env.BACKPACK_API_PUBLIC_KEY || '',
      privateKey: process.env.BACKPACK_API_PRIVATE_KEY || '',
    };
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

    const privateKeyBytes = Buffer.from(this.config.privateKey, 'base64');
    const messageBytes = decodeUTF8(signaturePayload);
    const signature = nacl.sign.detached(messageBytes, privateKeyBytes);

    return encodeBase64(signature);
  }

  async getBorrowLendMarkets(): Promise<any> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/v1/markets/borrow-lend`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Backpack API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch borrow/lend markets:', error);
      throw error;
    }
  }

  async getBorrowLendPositions(): Promise<any> {
    try {
      const timestamp = Date.now();
      const window = 5000;
      const signature = this.generateSignature('borrowLendExecute', {}, timestamp, window);

      const response = await fetch(`${this.config.baseUrl}/api/v1/capital/borrow-lend/positions`, {
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
        throw new Error(`Backpack API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
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

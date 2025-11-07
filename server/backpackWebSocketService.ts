import WebSocket from 'ws';
import nacl from 'tweetnacl';
import { EventEmitter } from 'events';

interface BackpackWSConfig {
  wsUrl: string;
  publicKey: string;
  privateKey: string;
}

interface SubscriptionRequest {
  method: 'SUBSCRIBE' | 'UNSUBSCRIBE';
  params: string[];
  signature?: [string, string, string, string];
}

interface WebSocketMessage {
  stream: string;
  data: any;
}

export type OrderUpdateEvent = {
  e: string;
  E: number;
  s: string;
  c?: number;
  S: string;
  o: string;
  f: string;
  q?: string;
  Q?: string;
  p?: string;
  X: string;
  i: string;
  t?: number;
  l?: string;
  z?: string;
  Z?: string;
  L?: string;
  m?: boolean;
  n?: string;
  N?: string;
  T: number;
  O: string;
};

export type PositionUpdateEvent = {
  e?: string;
  E?: number;
  s: string;
  b: number;
  B: number;
  f: number;
  M: number;
  m: number;
  q: number;
  Q: number;
  n: number;
  i: string;
  p: string;
  P: string;
  T?: number;
};

export type RFQUpdateEvent = {
  e: string;
  E: number;
  R: string;
  C?: string;
  u?: string;
  s: string;
  S?: string;
  q?: string;
  Q?: string;
  w: number;
  W: number;
  X: string;
  T: number;
};

class BackpackWebSocketService extends EventEmitter {
  private config: BackpackWSConfig;
  private ws: WebSocket | null = null;
  private keyPair: nacl.SignKeyPair | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private subscriptions: Set<string> = new Set();
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;

  constructor() {
    super();
    
    const privateKey = process.env.BACKPACK_PRIVATE_KEY || '';
    const publicKey = process.env.BACKPACK_API_KEY || '';
    
    // Initialize keypair from private key
    if (privateKey) {
      try {
        const seedBytes = Buffer.from(privateKey, 'base64');
        this.keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
        console.log('✅ WebSocket: Keypair initialized from private key');
      } catch (error) {
        console.error('❌ WebSocket: Failed to initialize keypair:', error);
      }
    }
    
    // Use the exact public key provided by Backpack
    this.config = {
      wsUrl: 'wss://ws.backpack.exchange',
      publicKey: publicKey,
      privateKey,
    };
  }

  private generateSignature(timestamp: number, window: number = 5000): string {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }

    const signaturePayload = `instruction=subscribe&timestamp=${timestamp}&window=${window}`;
    const messageBytes = new TextEncoder().encode(signaturePayload);
    const signature = nacl.sign.detached(messageBytes, this.keyPair.secretKey);

    return Buffer.from(signature).toString('base64');
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        resolve();
        return;
      }

      this.isConnecting = true;
      console.log('🔌 Connecting to Backpack WebSocket...');

      try {
        this.ws = new WebSocket(this.config.wsUrl);

        this.ws.on('open', () => {
          console.log('✅ Backpack WebSocket connected');
          this.isConnecting = false;
          this.setupPingPong();
          this.resubscribeAll();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
            console.error('Raw message:', data.toString().substring(0, 200));
          }
        });

        this.ws.on('ping', () => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.pong();
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          console.log(`❌ Backpack WebSocket closed: ${code} - ${reason.toString()}`);
          this.isConnecting = false;
          this.cleanup();
          
          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (error: Error) => {
          console.error('Backpack WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        });

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private setupPingPong(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }

    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    console.log('⏳ Scheduling WebSocket reconnection in 5s...');
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect().catch(console.error);
      }
    }, 5000);
  }

  private cleanup(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private resubscribeAll(): void {
    const subs = Array.from(this.subscriptions);
    if (subs.length > 0) {
      console.log(`🔄 Resubscribing to ${subs.length} streams...`);
      subs.forEach(stream => {
        this.subscribe(stream).catch(console.error);
      });
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    const { stream, data } = message;

    // Handle subscription confirmations or errors
    if (!stream) {
      console.log('📨 WebSocket message (no stream):', message);
      this.emit('message', message);
      return;
    }

    if (stream.startsWith('account.orderUpdate')) {
      this.emit('orderUpdate', data as OrderUpdateEvent);
    } else if (stream.startsWith('account.positionUpdate')) {
      this.emit('positionUpdate', data as PositionUpdateEvent);
    } else if (stream.startsWith('account.rfqUpdate')) {
      this.emit('rfqUpdate', data as RFQUpdateEvent);
    } else if (stream.startsWith('depth')) {
      this.emit('depth', data);
    } else if (stream.startsWith('trades')) {
      this.emit('trades', data);
    } else if (stream.startsWith('ticker')) {
      this.emit('ticker', data);
    } else if (stream.startsWith('kline')) {
      this.emit('kline', data);
    } else {
      this.emit('message', message);
    }
  }

  async subscribe(stream: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const isPrivateStream = stream.startsWith('account.');
    const request: SubscriptionRequest = {
      method: 'SUBSCRIBE',
      params: [stream],
    };

    if (isPrivateStream) {
      const timestamp = Date.now();
      const window = 5000;
      const signature = this.generateSignature(timestamp, window);

      request.signature = [
        this.config.publicKey,
        signature,
        timestamp.toString(),
        window.toString(),
      ];
      
      console.log('🔐 WebSocket Subscribe Debug:');
      console.log(`   Stream: ${stream}`);
      console.log(`   Timestamp: ${timestamp}`);
      console.log(`   Window: ${window}`);
      console.log(`   Public Key (len): ${this.config.publicKey.length} chars`);
      console.log(`   Signature (len): ${signature.length} chars`);
      console.log(`   Request: ${JSON.stringify(request).substring(0, 200)}...`);
    }

    this.ws!.send(JSON.stringify(request));
    this.subscriptions.add(stream);
    console.log(`📡 Subscribed to ${stream}`);
  }

  async unsubscribe(stream: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const request: SubscriptionRequest = {
      method: 'UNSUBSCRIBE',
      params: [stream],
    };

    this.ws.send(JSON.stringify(request));
    this.subscriptions.delete(stream);
    console.log(`📡 Unsubscribed from ${stream}`);
  }

  disconnect(): void {
    console.log('🔌 Disconnecting Backpack WebSocket...');
    this.shouldReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.cleanup();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.subscriptions.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}

export const backpackWebSocketService = new BackpackWebSocketService();
export default BackpackWebSocketService;

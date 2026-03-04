import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import axios from 'axios';
import { db } from './db';
import { xAuthTokens, xPosts } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface PostTweetParams {
  content: string;
  postType?: string;
  mediaIds?: string[];
}

interface SearchTweetsParams {
  query: string;
  maxResults?: number;
}

export class XApiService {
  private oauth: OAuth | null = null;
  private token: { key: string; secret: string } | null = null;
  private apiKey: string | null = null;
  private apiKeySecret: string | null = null;

  async initialize(): Promise<boolean> {
    try {
      // Load credentials from database
      const authTokens = await db.select()
        .from(xAuthTokens)
        .where(eq(xAuthTokens.isActive, true))
        .limit(1);

      if (authTokens.length === 0) {
        console.log('❌ No active X credentials found');
        return false;
      }

      const credentials = authTokens[0];
      this.apiKey = credentials.apiKey;
      this.apiKeySecret = credentials.apiKeySecret;

      this.oauth = new OAuth({
        consumer: {
          key: credentials.apiKey,
          secret: credentials.apiKeySecret,
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
          return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        },
      });

      this.token = {
        key: credentials.accessToken,
        secret: credentials.accessTokenSecret,
      };

      console.log(`✅ X API Service initialized for ${credentials.accountName}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize X API Service:', error);
      return false;
    }
  }

  async postTweet(params: PostTweetParams): Promise<{ success: boolean; tweetId?: string; error?: string }> {
    try {
      if (!this.oauth || !this.token) {
        const initialized = await this.initialize();
        if (!initialized) {
          return { success: false, error: 'X API not initialized' };
        }
      }

      const requestData = {
        url: 'https://api.twitter.com/2/tweets',
        method: 'POST' as const,
      };

      const authHeader = this.oauth!.toHeader(this.oauth!.authorize(requestData, this.token!));

      console.log(`🐦 Posting tweet: "${params.content.substring(0, 50)}..."`);

      const tweetPayload: any = { text: params.content };
      if (params.mediaIds && params.mediaIds.length > 0) {
        tweetPayload.media = {
          media_ids: params.mediaIds
        };
      }

      const response = await axios.post(
        requestData.url,
        tweetPayload,
        {
          headers: {
            ...authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      const tweetId = response.data.data.id;
      console.log(`✅ Tweet posted successfully: https://twitter.com/user/status/${tweetId}`);

      // Save to database
      await db.insert(xPosts).values({
        tweetId,
        content: params.content,
        postType: params.postType || 'manual',
        status: 'posted',
        postedAt: new Date(),
      });

      return { success: true, tweetId };
    } catch (error: any) {
      console.error('❌ Failed to post tweet:', error.response?.data || error.message);
      
      // Save failed post to database
      await db.insert(xPosts).values({
        content: params.content,
        postType: params.postType || 'manual',
        status: 'failed',
        errorMessage: error.response?.data?.detail || error.message,
      });

      return { 
        success: false, 
        error: error.response?.data?.detail || error.message 
      };
    }
  }

  async searchTweets(params: SearchTweetsParams): Promise<any[]> {
    try {
      if (!this.oauth || !this.token) {
        const initialized = await this.initialize();
        if (!initialized) {
          return [];
        }
      }

      const maxResults = Math.min(params.maxResults || 10, 100);
      const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(params.query)}&max_results=${maxResults}&tweet.fields=author_id,created_at,public_metrics`;

      const requestData = {
        url,
        method: 'GET' as const,
      };

      const authHeader = this.oauth!.toHeader(this.oauth!.authorize(requestData, this.token!));

      console.log(`🔍 Searching tweets: "${params.query}"`);

      const response = await axios.get(url, {
        headers: {
          ...authHeader,
        },
      });

      console.log(`✅ Found ${response.data.data?.length || 0} tweets`);
      return response.data.data || [];
    } catch (error: any) {
      console.error('❌ Failed to search tweets:', error.response?.data || error.message);
      return [];
    }
  }

  async uploadMedia(imageBuffer: Buffer): Promise<{ success: boolean; mediaId?: string; error?: string }> {
    try {
      if (!this.oauth || !this.token) {
        const initialized = await this.initialize();
        if (!initialized) {
          return { success: false, error: 'X API not initialized' };
        }
      }

      const requestData = {
        url: 'https://upload.twitter.com/1.1/media/upload.json',
        method: 'POST' as const,
      };

      const authHeader = this.oauth!.toHeader(this.oauth!.authorize(requestData, this.token!));

      console.log(`📸 Uploading media (${imageBuffer.length} bytes)...`);

      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('media', imageBuffer, {
        filename: 'card.png',
        contentType: 'image/png',
      });

      const response = await axios.post(
        requestData.url,
        formData,
        {
          headers: {
            ...authHeader,
            ...formData.getHeaders(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      const mediaId = response.data.media_id_string;
      console.log(`✅ Media uploaded successfully: ${mediaId}`);

      return { success: true, mediaId };
    } catch (error: any) {
      console.error('❌ Failed to upload media:', error.response?.data || error.message);
      return { 
        success: false, 
        error: error.response?.data?.error || error.message 
      };
    }
  }

  async replyToTweet(tweetId: string, content: string): Promise<{ success: boolean; replyTweetId?: string; error?: string }> {
    try {
      if (!this.oauth || !this.token) {
        const initialized = await this.initialize();
        if (!initialized) {
          return { success: false, error: 'X API not initialized' };
        }
      }

      const requestData = {
        url: 'https://api.twitter.com/2/tweets',
        method: 'POST' as const,
      };

      const authHeader = this.oauth!.toHeader(this.oauth!.authorize(requestData, this.token!));

      console.log(`💬 Replying to tweet ${tweetId}: "${content.substring(0, 50)}..."`);

      const response = await axios.post(
        requestData.url,
        { 
          text: content,
          reply: {
            in_reply_to_tweet_id: tweetId
          }
        },
        {
          headers: {
            ...authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      const replyTweetId = response.data.data.id;
      console.log(`✅ Reply posted: https://twitter.com/user/status/${replyTweetId}`);

      // Save to database
      await db.insert(xPosts).values({
        tweetId: replyTweetId,
        content,
        postType: 'engagement',
        status: 'posted',
        postedAt: new Date(),
      });

      return { success: true, replyTweetId };
    } catch (error: any) {
      console.error('❌ Failed to reply to tweet:', error.response?.data || error.message);
      return { 
        success: false, 
        error: error.response?.data?.detail || error.message 
      };
    }
  }
  /**
   * Announce a successful transaction on X (Twitter) if it meets the threshold
   * Handles card generation, media upload, tweet posting, and database updates
   * 
   * @param params Transaction details
   * @returns Success status and post ID
   */
  async announceTransactionOnX(params: {
    transactionType: 'sol_reclaim' | 'nft_burn' | 'token_burn';
    netAmount: number | string;
    walletAddress: string;
    signature: string;
    itemsProcessed: number;
  }): Promise<{ success: boolean; postId?: string; error?: string }> {
    try {
      const { transactionType, walletAddress, signature, itemsProcessed } = params;

      // Defensive type coercion - handle both numbers and numeric strings
      const netAmount = Number(params.netAmount || 0);
      
      // Validate that we got a valid number
      if (isNaN(netAmount)) {
        return { 
          success: false, 
          error: `Invalid net amount: ${params.netAmount}` 
        };
      }

      // Threshold check: 0.02 SOL minimum for all transaction types
      const MIN_FOR_POST = 0.02;
      if (netAmount < MIN_FOR_POST) {
        return { 
          success: false, 
          error: `Amount ${netAmount} SOL is below posting threshold of ${MIN_FOR_POST} SOL` 
        };
      }

      // Initialize if needed
      if (!this.oauth || !this.token) {
        const initialized = await this.initialize();
        if (!initialized) {
          return { success: false, error: 'X API not initialized' };
        }
      }

      // Generate transaction-type-specific message
      let claimMessages: string[];
      let actionText: string;

      if (netAmount >= 4) {
        claimMessages = ["💥 JACKPOT!", "🏆 Unreal", "⚡ Legendary drop"];
      } else if (netAmount >= 1) {
        claimMessages = ["🔥 Hot drop!", "🚨 Big claim", "🏆 On-chain win"];
      } else if (netAmount >= 0.1) {
        claimMessages = ["💎 Nice one!", "🪙 That's a sweet claim", "🎯 Boom! 🎯 Hot claim"];
      } else {
        claimMessages = ["🚀 Claimed", "🎉 Free SOL claimed", "💥 Another smooth claim"];
      }

      // Customize action text based on transaction type
      switch (transactionType) {
        case 'sol_reclaim':
          actionText = 'just got claimed';
          break;
        case 'nft_burn':
          actionText = itemsProcessed === 1 ? 'recovered from NFT burn' : `recovered from ${itemsProcessed} NFT burns`;
          break;
        case 'token_burn':
          actionText = `recovered from burning ${itemsProcessed} token${itemsProcessed > 1 ? 's' : ''}`;
          break;
        default:
          actionText = 'recovered';
      }

      const randomMessage = claimMessages[Math.floor(Math.random() * claimMessages.length)];
      const tweetContent = `${randomMessage} ${netAmount.toFixed(4)} SOL ${actionText}. #GetFreeSol #ClaimSOL #Solana #DeFi #sol

Claimer: ${walletAddress}`;

      console.log(`📢 Posting ${transactionType} alert to X for ${netAmount} SOL (NET)...`);

      // Generate card banner
      const { generateClaimCardBanner } = await import('./cardBannerGenerator.js');
      const cardImage = await generateClaimCardBanner({
        solAmount: netAmount.toString(),
        walletAddress
      });

      // Upload media
      const uploadResult = await this.uploadMedia(cardImage);
      let mediaIds: string[] = [];
      if (uploadResult.success && uploadResult.mediaId) {
        mediaIds = [uploadResult.mediaId];
      }

      // Post tweet
      const postResult = await this.postTweet({
        content: tweetContent,
        postType: `${transactionType}_alert`,
        mediaIds
      });

      if (postResult.success && postResult.tweetId) {
        console.log(`✅ Posted ${transactionType} to X successfully! Post ID: ${postResult.tweetId}`);
        return { success: true, postId: postResult.tweetId };
      } else {
        console.error(`❌ X post failed for ${transactionType} (${netAmount} SOL):`, {
          success: postResult.success,
          error: postResult.error,
          signature
        });
        return { success: false, error: postResult.error };
      }

    } catch (error: any) {
      console.error('Failed to announce transaction on X (exception):', error);
      return { success: false, error: error.message };
    }
  }
}

export const xApiService = new XApiService();

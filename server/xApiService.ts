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
}

export const xApiService = new XApiService();

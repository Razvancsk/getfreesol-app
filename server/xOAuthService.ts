import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import axios from 'axios';
import { db } from './db';
import { xAuthTokens } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface RequestTokenResponse {
  oauth_token: string;
  oauth_token_secret: string;
  oauth_callback_confirmed: string;
}

interface AccessTokenResponse {
  oauth_token: string;
  oauth_token_secret: string;
  user_id: string;
  screen_name: string;
}

export class XOAuthService {
  private apiKey: string;
  private apiKeySecret: string;
  private oauth: OAuth;
  private pendingTokenSecrets: Map<string, string> = new Map();

  constructor() {
    this.apiKey = process.env.X_API_KEY || '';
    this.apiKeySecret = process.env.X_API_SECRET || '';

    if (!this.apiKey || !this.apiKeySecret) {
      console.error('❌ X_API_KEY or X_API_SECRET not found in environment');
    }

    this.oauth = new OAuth({
      consumer: {
        key: this.apiKey,
        secret: this.apiKeySecret,
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });
  }

  async getRequestToken(callbackUrl: string): Promise<{ authUrl: string; oauthToken: string }> {
    try {
      const requestData = {
        url: 'https://api.twitter.com/oauth/request_token',
        method: 'POST' as const,
        data: { oauth_callback: callbackUrl },
      };

      const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData));

      console.log('🔐 Requesting OAuth token from X...');

      const response = await axios.post(
        requestData.url,
        {},
        {
          headers: {
            ...authHeader,
          },
          params: {
            oauth_callback: callbackUrl,
          },
        }
      );

      const params = new URLSearchParams(response.data);
      const oauthToken = params.get('oauth_token');
      const oauthTokenSecret = params.get('oauth_token_secret');
      const oauthCallbackConfirmed = params.get('oauth_callback_confirmed');

      if (!oauthToken || !oauthTokenSecret || oauthCallbackConfirmed !== 'true') {
        throw new Error('Invalid request token response');
      }

      this.pendingTokenSecrets.set(oauthToken, oauthTokenSecret);

      const authUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`;

      console.log('✅ OAuth request token received');

      return { authUrl, oauthToken };
    } catch (error: any) {
      console.error('❌ Failed to get request token:', error.response?.data || error.message);
      throw new Error('Failed to initiate OAuth flow');
    }
  }

  async getAccessToken(oauthToken: string, oauthVerifier: string): Promise<AccessTokenResponse> {
    try {
      const tokenSecret = this.pendingTokenSecrets.get(oauthToken);
      
      if (!tokenSecret) {
        throw new Error('Token secret not found. Please restart the OAuth flow.');
      }

      const requestData = {
        url: 'https://api.twitter.com/oauth/access_token',
        method: 'POST' as const,
      };

      const authHeader = this.oauth.toHeader(
        this.oauth.authorize(requestData, {
          key: oauthToken,
          secret: tokenSecret,
        })
      );

      console.log('🔐 Exchanging OAuth verifier for access token...');

      const response = await axios.post(
        requestData.url,
        {},
        {
          headers: {
            ...authHeader,
          },
          params: {
            oauth_token: oauthToken,
            oauth_verifier: oauthVerifier,
          },
        }
      );

      const params = new URLSearchParams(response.data);
      const accessToken = params.get('oauth_token');
      const accessTokenSecret = params.get('oauth_token_secret');
      const userId = params.get('user_id');
      const screenName = params.get('screen_name');

      if (!accessToken || !accessTokenSecret || !userId || !screenName) {
        throw new Error('Invalid access token response');
      }

      this.pendingTokenSecrets.delete(oauthToken);

      console.log(`✅ Access token received for @${screenName}`);

      return {
        oauth_token: accessToken,
        oauth_token_secret: accessTokenSecret,
        user_id: userId,
        screen_name: screenName,
      };
    } catch (error: any) {
      console.error('❌ Failed to get access token:', error.response?.data || error.message);
      throw new Error('Failed to complete OAuth flow');
    }
  }

  async saveCredentials(accessTokenData: AccessTokenResponse): Promise<void> {
    try {
      await db.update(xAuthTokens)
        .set({ isActive: false })
        .where(eq(xAuthTokens.isActive, true));

      await db.insert(xAuthTokens).values({
        apiKey: this.apiKey,
        apiKeySecret: this.apiKeySecret,
        accessToken: accessTokenData.oauth_token,
        accessTokenSecret: accessTokenData.oauth_token_secret,
        accountName: accessTokenData.screen_name,
        accountId: accessTokenData.user_id,
        isActive: true,
      });

      console.log(`✅ Credentials saved for @${accessTokenData.screen_name}`);
    } catch (error) {
      console.error('❌ Failed to save credentials:', error);
      throw new Error('Failed to save X credentials');
    }
  }

  async getActiveAccount(): Promise<{ accountName: string; accountId: string } | null> {
    try {
      const authTokens = await db.select()
        .from(xAuthTokens)
        .where(eq(xAuthTokens.isActive, true))
        .limit(1);

      if (authTokens.length === 0) {
        return null;
      }

      const credentials = authTokens[0];
      
      if (!credentials.accountName || !credentials.accountId) {
        return null;
      }
      
      return {
        accountName: credentials.accountName,
        accountId: credentials.accountId,
      };
    } catch (error) {
      console.error('❌ Failed to get active account:', error);
      return null;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await db.update(xAuthTokens)
        .set({ isActive: false })
        .where(eq(xAuthTokens.isActive, true));

      console.log('✅ X account disconnected');
    } catch (error) {
      console.error('❌ Failed to disconnect account:', error);
      throw new Error('Failed to disconnect X account');
    }
  }
}

export const xOAuthService = new XOAuthService();

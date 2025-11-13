import { db } from "../db";
import { alertConfigs, alertHistory, notificationPreferences, emptyTokenAccounts } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

// Alert types supported by the system
export type AlertType = 
  | 'claimable_sol_threshold'
  | 'portfolio_value_change'
  | 'new_nft'
  | 'transaction_confirmed';

// Alert condition interfaces
export interface ClaimableSOLThresholdCondition {
  threshold: number; // Minimum SOL amount to trigger alert
}

export interface PortfolioValueChangeCondition {
  percentageChange: number; // Percentage change to trigger alert (e.g., 10 for 10%)
  timeWindow: number; // Time window in hours to check for changes
}

export interface NewNFTCondition {
  enabled: boolean;
}

export interface TransactionConfirmedCondition {
  enabled: boolean;
  minAmount: number; // Minimum SOL amount for alert
}

/**
 * Check all enabled alerts for a specific wallet
 */
export async function checkAlertsForWallet(walletAddress: string): Promise<void> {
  try {
    // Get all enabled alerts for this wallet
    const alerts = await db.select()
      .from(alertConfigs)
      .where(
        and(
          eq(alertConfigs.walletAddress, walletAddress),
          eq(alertConfigs.enabled, true)
        )
      );

    for (const alert of alerts) {
      const conditions = JSON.parse(alert.conditions);
      const channels = JSON.parse(alert.notificationChannels);

      switch (alert.alertType) {
        case 'claimable_sol_threshold':
          await checkClaimableSOLThreshold(walletAddress, conditions, channels, alert.id);
          break;
        case 'portfolio_value_change':
          await checkPortfolioValueChange(walletAddress, conditions, channels, alert.id);
          break;
        case 'new_nft':
          await checkNewNFT(walletAddress, conditions, channels, alert.id);
          break;
        case 'transaction_confirmed':
          await checkTransactionConfirmed(walletAddress, conditions, channels, alert.id);
          break;
      }
    }
  } catch (error) {
    console.error(`Error checking alerts for wallet ${walletAddress}:`, error);
  }
}

/**
 * Check if claimable SOL exceeds threshold
 */
async function checkClaimableSOLThreshold(
  walletAddress: string,
  conditions: ClaimableSOLThresholdCondition,
  channels: string[],
  alertConfigId: string
): Promise<void> {
  try {
    // Get all empty token accounts for this wallet
    const accounts = await db.select()
      .from(emptyTokenAccounts)
      .where(
        and(
          eq(emptyTokenAccounts.walletAddress, walletAddress),
          eq(emptyTokenAccounts.claimed, false)
        )
      );

    // Calculate total claimable SOL
    const totalClaimable = accounts.reduce(
      (sum, account) => sum + parseFloat(account.rentAmount),
      0
    );

    // Trigger alert if threshold is met
    if (totalClaimable >= conditions.threshold) {
      const message = `You have ${totalClaimable.toFixed(6)} SOL available to claim from ${accounts.length} empty token accounts!`;
      await triggerAlert(
        alertConfigId,
        walletAddress,
        'claimable_sol_threshold',
        message,
        { totalClaimable, accountsCount: accounts.length },
        channels
      );
    }
  } catch (error) {
    console.error('Error checking claimable SOL threshold:', error);
  }
}

/**
 * Check for portfolio value changes
 */
async function checkPortfolioValueChange(
  walletAddress: string,
  conditions: PortfolioValueChangeCondition,
  channels: string[],
  alertConfigId: string
): Promise<void> {
  // TODO: Implement portfolio value tracking and comparison
  // This would require storing historical portfolio values and comparing them
  console.log('Portfolio value change checking not yet implemented');
}

/**
 * Check for new NFTs
 */
async function checkNewNFT(
  walletAddress: string,
  conditions: NewNFTCondition,
  channels: string[],
  alertConfigId: string
): Promise<void> {
  // TODO: Implement NFT tracking
  // This would require storing a list of known NFTs and checking for new ones
  console.log('New NFT checking not yet implemented');
}

/**
 * Check for confirmed transactions
 */
async function checkTransactionConfirmed(
  walletAddress: string,
  conditions: TransactionConfirmedCondition,
  channels: string[],
  alertConfigId: string
): Promise<void> {
  // TODO: Implement transaction confirmation tracking
  // This would monitor pending transactions and alert when confirmed
  console.log('Transaction confirmed checking not yet implemented');
}

/**
 * Trigger an alert and send notifications
 */
export async function triggerAlert(
  alertConfigId: string,
  walletAddress: string,
  alertType: AlertType,
  message: string,
  metadata: any,
  channels: string[]
): Promise<void> {
  try {
    // Check if this alert was already triggered recently (avoid spam)
    const recentAlerts = await db.select()
      .from(alertHistory)
      .where(
        and(
          eq(alertHistory.alertConfigId, alertConfigId),
          eq(alertHistory.walletAddress, walletAddress)
        )
      )
      .limit(1)
      .orderBy(alertHistory.triggeredAt);

    // Don't trigger if same alert was sent in last hour
    if (recentAlerts.length > 0) {
      const lastAlert = recentAlerts[0];
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastAlert.triggeredAt > oneHourAgo) {
        console.log(`Alert already sent recently for ${walletAddress}, skipping`);
        return;
      }
    }

    // Save alert to history
    await db.insert(alertHistory).values({
      alertConfigId,
      walletAddress,
      alertType,
      message,
      metadata: JSON.stringify(metadata),
    });

    // Send notifications through enabled channels
    await sendNotifications(walletAddress, message, metadata, channels);

    console.log(`Alert triggered for ${walletAddress}: ${message}`);
  } catch (error) {
    console.error('Error triggering alert:', error);
  }
}

/**
 * Send notifications through all enabled channels
 */
async function sendNotifications(
  walletAddress: string,
  message: string,
  metadata: any,
  channels: string[]
): Promise<void> {
  // Get user's notification preferences
  const prefs = await db.select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.walletAddress, walletAddress))
    .limit(1);

  const preferences = prefs[0];

  for (const channel of channels) {
    switch (channel) {
      case 'in_app':
        if (!preferences || preferences.inAppEnabled) {
          // In-app notifications are handled by the frontend polling for new alerts
          console.log(`In-app notification queued for ${walletAddress}`);
        }
        break;
      case 'discord':
        if (preferences?.discordEnabled && preferences.discordWebhookUrl) {
          await sendDiscordNotification(preferences.discordWebhookUrl, message, metadata);
        }
        break;
      case 'push':
        if (preferences?.pushEnabled && preferences.pushSubscription) {
          await sendPushNotification(preferences.pushSubscription, message, metadata);
        }
        break;
    }
  }
}

/**
 * Send Discord webhook notification
 */
async function sendDiscordNotification(
  webhookUrl: string,
  message: string,
  metadata: any
): Promise<void> {
  try {
    const axios = (await import('axios')).default;
    
    await axios.post(webhookUrl, {
      embeds: [{
        title: '🔔 GetFreeSOL Alert',
        description: message,
        color: 0x9333EA, // Purple color
        timestamp: new Date().toISOString(),
        fields: Object.keys(metadata).map(key => ({
          name: key,
          value: String(metadata[key]),
          inline: true
        }))
      }]
    });
    
    console.log('Discord notification sent successfully');
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

/**
 * Send browser push notification
 */
async function sendPushNotification(
  subscriptionJson: string,
  message: string,
  metadata: any
): Promise<void> {
  try {
    const webpush = (await import('web-push')).default;
    const subscription = JSON.parse(subscriptionJson);
    
    // Note: You'll need to set VAPID keys for web push
    // webpush.setVapidDetails(
    //   'mailto:your-email@example.com',
    //   process.env.VAPID_PUBLIC_KEY!,
    //   process.env.VAPID_PRIVATE_KEY!
    // );
    
    const payload = JSON.stringify({
      title: 'GetFreeSOL Alert',
      body: message,
      data: metadata
    });
    
    // await webpush.sendNotification(subscription, payload);
    console.log('Push notification would be sent (VAPID keys required)');
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

/**
 * Check all wallets for alerts
 * This function is called periodically by the cron job
 */
export async function checkAllWalletAlerts(): Promise<void> {
  try {
    console.log('🔔 Checking alerts for all wallets...');
    
    // Get all unique wallet addresses with enabled alerts
    const enabledAlerts = await db.select()
      .from(alertConfigs)
      .where(eq(alertConfigs.enabled, true));

    const uniqueWallets = [...new Set(enabledAlerts.map(a => a.walletAddress))];
    
    console.log(`Found ${uniqueWallets.length} wallets with enabled alerts`);
    
    // Check alerts for each wallet
    for (const walletAddress of uniqueWallets) {
      await checkAlertsForWallet(walletAddress);
    }
    
    console.log('✅ Alert check complete');
  } catch (error) {
    console.error('Error in checkAllWalletAlerts:', error);
  }
}

import fetch from 'node-fetch';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_CHECK_WEBHOOK_URL = process.env.DISCORD_CHECK_WEBHOOK_URL;

interface ClaimAlert {
  walletAddress: string;
  solAmount: number;
  accountsClosed: number;
  signature: string;
}

export async function sendClaimAlert(alert: ClaimAlert): Promise<{ success: boolean; error?: string }> {
  if (!DISCORD_WEBHOOK_URL) {
    console.error('❌ DISCORD_WEBHOOK_URL not configured');
    return { success: false, error: 'Webhook URL not configured' };
  }

  try {
    const { walletAddress, solAmount, accountsClosed, signature } = alert;
    
    // Determine color based on SOL amount (decimal color codes)
    let embedColor: number;
    let tierEmoji: string;
    if (solAmount >= 4) {
      embedColor = 0xFF6B00; // Orange for massive claims
      tierEmoji = '💥';
    } else if (solAmount >= 1) {
      embedColor = 0xFFD700; // Gold for big claims
      tierEmoji = '🔥';
    } else if (solAmount >= 0.1) {
      embedColor = 0x9945FF; // Purple for medium claims
      tierEmoji = '💎';
    } else {
      embedColor = 0x00D4AA; // Teal for small claims
      tierEmoji = '🚀';
    }

    const solscanUrl = `https://solscan.io/tx/${signature}`;
    
    const embed = {
      title: `${tierEmoji} SOL Claimed!`,
      color: embedColor,
      fields: [
        {
          name: '💰 Amount',
          value: `**${solAmount.toFixed(6)} SOL**`,
          inline: true
        },
        {
          name: '🗑️ Accounts Closed',
          value: `**${accountsClosed}**`,
          inline: true
        },
        {
          name: '👤 Wallet',
          value: `\`${walletAddress}\``,
          inline: false
        },
        {
          name: '🔗 Transaction',
          value: `[View on Solscan](${solscanUrl})`,
          inline: false
        }
      ],
      footer: {
        text: 'GetFreeSol.com • Reclaim your SOL today!'
      },
      timestamp: new Date().toISOString()
    };

    const payload = {
      username: 'GetFreeSol Alerts',
      avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
      embeds: [embed]
    };

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Discord webhook failed:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    console.log(`✅ Discord alert sent for ${solAmount} SOL claim`);
    return { success: true };

  } catch (error) {
    console.error('❌ Error sending Discord webhook:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

interface WalletCheckAlert {
  walletAddress: string;
  emptyAccountsFound: number;
  estimatedSOL: number;
}

export async function sendWalletCheckAlert(alert: WalletCheckAlert): Promise<{ success: boolean; error?: string }> {
  if (!DISCORD_CHECK_WEBHOOK_URL) {
    console.error('❌ DISCORD_CHECK_WEBHOOK_URL not configured');
    return { success: false, error: 'Webhook URL not configured' };
  }

  try {
    const { walletAddress, emptyAccountsFound, estimatedSOL } = alert;
    
    // Determine color and emoji based on amount found
    let embedColor: number;
    let statusEmoji: string;
    if (emptyAccountsFound === 0) {
      embedColor = 0x808080; // Gray for no claims
      statusEmoji = '❌';
    } else if (estimatedSOL >= 0.1) {
      embedColor = 0x00FF00; // Green for good finds
      statusEmoji = '💰';
    } else if (estimatedSOL >= 0.01) {
      embedColor = 0xFFFF00; // Yellow for decent finds
      statusEmoji = '✅';
    } else {
      embedColor = 0x9945FF; // Purple for small finds
      statusEmoji = '🔍';
    }

    const solscanUrl = `https://solscan.io/account/${walletAddress}`;
    
    const embed = {
      title: `${statusEmoji} Wallet Check`,
      color: embedColor,
      fields: [
        {
          name: '🗑️ Empty Accounts',
          value: `**${emptyAccountsFound}**`,
          inline: true
        },
        {
          name: '💰 Estimated SOL',
          value: `**~${estimatedSOL.toFixed(6)} SOL**`,
          inline: true
        },
        {
          name: '👤 Wallet',
          value: `\`${walletAddress}\``,
          inline: false
        },
        {
          name: '🔗 Solscan',
          value: `[View Wallet](${solscanUrl})`,
          inline: false
        }
      ],
      footer: {
        text: 'GetFreeSol.com • Check your wallet today!'
      },
      timestamp: new Date().toISOString()
    };

    const payload = {
      username: 'GetFreeSol Wallet Checks',
      avatar_url: 'https://cdn.discordapp.com/embed/avatars/1.png',
      embeds: [embed]
    };

    const response = await fetch(DISCORD_CHECK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Discord check webhook failed:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    console.log(`✅ Discord wallet check alert sent for ${walletAddress}: ${emptyAccountsFound} accounts, ~${estimatedSOL} SOL`);
    return { success: true };

  } catch (error) {
    console.error('❌ Error sending Discord check webhook:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

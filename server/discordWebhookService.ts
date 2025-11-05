import fetch from 'node-fetch';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

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

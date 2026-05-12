import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { join } from 'path';

function getEnvUrl(name: string): string {
  try {
    const lines = readFileSync(join(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith(name + '=')) return t.slice(name.length + 1).trim();
    }
  } catch {}
  return process.env[name] || '';
}

interface ClaimAlert {
  walletAddress: string;
  solAmount: number;
  accountsClosed: number;
  signature: string;
}

export async function sendClaimAlert(alert: ClaimAlert): Promise<{ success: boolean; error?: string }> {
  const DISCORD_WEBHOOK_URL = getEnvUrl('DISCORD_WEBHOOK_URL');
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
  const DISCORD_CHECK_WEBHOOK_URL = getEnvUrl('DISCORD_CHECK_WEBHOOK_URL');
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

interface TokenBurnAlert {
  walletAddress: string;
  solAmount: number;
  tokensBurned: number;
  signature: string;
}

export async function sendTokenBurnAlert(alert: TokenBurnAlert): Promise<{ success: boolean; error?: string }> {
  const DISCORD_WEBHOOK_URL = getEnvUrl('DISCORD_WEBHOOK_URL');
  if (!DISCORD_WEBHOOK_URL) {
    console.error('❌ DISCORD_WEBHOOK_URL not configured');
    return { success: false, error: 'Webhook URL not configured' };
  }

  try {
    const { walletAddress, solAmount, tokensBurned, signature } = alert;
    
    // Determine color based on SOL amount (same tiers as SOL claims)
    let embedColor: number;
    let tierEmoji: string;
    if (solAmount >= 4) {
      embedColor = 0xFF6B00; // Orange for massive burns
      tierEmoji = '💥';
    } else if (solAmount >= 1) {
      embedColor = 0xFFD700; // Gold for big burns
      tierEmoji = '🔥';
    } else if (solAmount >= 0.1) {
      embedColor = 0x9945FF; // Purple for medium burns
      tierEmoji = '💎';
    } else {
      embedColor = 0x00D4AA; // Teal for small burns
      tierEmoji = '🚀';
    }

    const solscanUrl = `https://solscan.io/tx/${signature}`;
    
    const embed = {
      title: `${tierEmoji} Tokens Burned!`,
      color: embedColor,
      fields: [
        {
          name: '💰 Amount',
          value: `**${solAmount.toFixed(6)} SOL**`,
          inline: true
        },
        {
          name: '🔥 Tokens Burned',
          value: `**${tokensBurned}**`,
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
      console.error('❌ Discord token burn webhook failed:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    console.log(`✅ Discord token burn alert sent for ${solAmount} SOL`);
    return { success: true };

  } catch (error) {
    console.error('❌ Error sending Discord token burn webhook:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

interface NFTBurnAlert {
  walletAddress: string;
  solAmount: number;
  nftType: string;
  signature: string;
}

export async function sendNFTBurnAlert(alert: NFTBurnAlert): Promise<{ success: boolean; error?: string }> {
  const DISCORD_WEBHOOK_URL = getEnvUrl('DISCORD_WEBHOOK_URL');
  if (!DISCORD_WEBHOOK_URL) {
    console.error('❌ DISCORD_WEBHOOK_URL not configured');
    return { success: false, error: 'Webhook URL not configured' };
  }

  try {
    const { walletAddress, solAmount, nftType, signature } = alert;
    
    // Determine color based on SOL amount (same tiers as SOL claims)
    let embedColor: number;
    let tierEmoji: string;
    if (solAmount >= 4) {
      embedColor = 0xFF6B00; // Orange for massive burns
      tierEmoji = '💥';
    } else if (solAmount >= 1) {
      embedColor = 0xFFD700; // Gold for big burns
      tierEmoji = '🔥';
    } else if (solAmount >= 0.1) {
      embedColor = 0x9945FF; // Purple for medium burns
      tierEmoji = '💎';
    } else {
      embedColor = 0x00D4AA; // Teal for small burns
      tierEmoji = '🚀';
    }

    const solscanUrl = `https://solscan.io/tx/${signature}`;
    
    const embed = {
      title: `${tierEmoji} NFT Burned!`,
      color: embedColor,
      fields: [
        {
          name: '💰 Amount',
          value: `**${solAmount.toFixed(6)} SOL**`,
          inline: true
        },
        {
          name: '🖼️ NFT Type',
          value: `**${nftType}**`,
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
      console.error('❌ Discord NFT burn webhook failed:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    console.log(`✅ Discord NFT burn alert sent for ${solAmount} SOL`);
    return { success: true };

  } catch (error) {
    console.error('❌ Error sending Discord NFT burn webhook:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

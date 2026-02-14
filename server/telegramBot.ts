import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Track recently processed messages to prevent duplicates
const processedMessages = new Set<string>();

// Solana RPC connection
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const RPC_URL = HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'https://api.mainnet-beta.solana.com';

const connection = new Connection(RPC_URL, 'confirmed');

// Scan wallet for empty token accounts
async function scanWallet(walletAddress: string): Promise<{ emptyAccounts: number; totalReclaimable: string }> {
  const pubkey = new PublicKey(walletAddress);
  
  // Fetch all token accounts for this wallet (both Token Program and Token-2022)
  const [tokenAccounts, token2022Accounts] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID })
  ]);

  const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];
  
  // Filter for empty accounts (balance = 0)
  const emptyAccounts = allAccounts.filter(account => {
    const tokenAmount = account.account.data.parsed.info.tokenAmount;
    return tokenAmount.uiAmount === 0 || tokenAmount.amount === '0';
  });

  // Calculate reclaimable rent (approximately 0.00203928 SOL per account)
  const rentPerAccount = 0.00203928;
  const totalReclaimable = (emptyAccounts.length * rentPerAccount).toFixed(6);

  return {
    emptyAccounts: emptyAccounts.length,
    totalReclaimable
  };
}

// Global bot instance
let botInstance: any = null;
let isInitializing = false;

export async function initializeTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('⚠️  TELEGRAM_BOT_TOKEN not configured - Telegram bot disabled');
    return;
  }

  if (isInitializing) {
    console.log('⚠️  Telegram bot is already initializing, skipping...');
    return;
  }

  if (botInstance) {
    console.log('⚠️  Telegram bot is already running, skipping initialization');
    return;
  }

  isInitializing = true;

  try {
    // Dynamic import for node-telegram-bot-api
    const TelegramBot = (await import('node-telegram-bot-api')).default;
    
    const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
    botInstance = bot;

    console.log('🤖 Telegram bot is starting...');

    bot.on('polling_error', (error: any) => {
      if (error?.code === 'ETELEGRAM' && error?.message?.includes('409 Conflict')) {
        return;
      }
      console.error('Telegram polling error:', error?.message || error);
    });

    // Handle /start command
    bot.onText(/\/start/, async (msg: any) => {
      const chatId = msg.chat.id;
      const username = msg.from?.username || msg.from?.first_name || 'there';
      
      try {
        await bot.sendMessage(chatId, 
          `👋 Welcome to GetFreeSol Bot, ${username}!\n\n` +
          `I help you find claimable SOL rent from empty token accounts on Solana.\n\n` +
          `🔍 Commands:\n` +
          `/scan wallet_address - Check a wallet for claimable rent\n` +
          `/help - Show this help message\n\n` +
          `Or just send me a Solana wallet address directly!\n\n` +
          `🌐 Visit getfreesol.xyz to claim your SOL!`,
          { disable_web_page_preview: true }
        );
      } catch (err: any) {
        console.error('Telegram /start error:', err?.message || err);
      }
    });

    // Handle /help command
    bot.onText(/\/help/, async (msg: any) => {
      const chatId = msg.chat.id;
      
      try {
        await bot.sendMessage(chatId,
          `🔍 GetFreeSol Bot Commands\n\n` +
          `/scan wallet_address - Scan a wallet for empty token accounts\n` +
          `/help - Show this help message\n\n` +
          `💡 Tips:\n` +
          `• Just paste a wallet address to scan it\n` +
          `• Each empty account holds ~0.002 SOL in rent\n` +
          `• Visit getfreesol.xyz to claim your rent`,
          { disable_web_page_preview: true }
        );
      } catch (err: any) {
        console.error('Telegram /help error:', err?.message || err);
      }
    });

    // Handle /scan command
    bot.onText(/\/scan(?:\s+(.+))?/, async (msg: any, match: any) => {
      const chatId = msg.chat.id;
      const messageId = `${chatId}-${msg.message_id}`;
      
      if (processedMessages.has(messageId)) return;
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 60000);

      const walletAddress = match?.[1]?.trim();
      
      try {
        if (!walletAddress) {
          await bot.sendMessage(chatId,
            `Please provide a wallet address.\n\nExample: /scan GnV7urSN5aiRWdioX5uRaYSoykWVJaKHwWGdb8BFH9Bm`
          );
          return;
        }

        await handleWalletScan(bot, chatId, walletAddress);
      } catch (err: any) {
        console.error('Telegram /scan error:', err?.message || err);
      }
    });

    // Handle plain wallet addresses
    bot.on('message', async (msg: any) => {
      const chatId = msg.chat.id;
      const text = msg.text?.trim();
      const messageId = `${chatId}-${msg.message_id}`;
      
      if (!text) return;
      
      // Skip if already processed
      if (processedMessages.has(messageId)) return;
      
      // Skip commands
      if (text.startsWith('/')) return;
      
      // Check if it's a valid Solana address (base58, 32-44 chars)
      const walletMatch = text.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})$/);
      
      if (walletMatch) {
        processedMessages.add(messageId);
        setTimeout(() => processedMessages.delete(messageId), 60000);
        
        await handleWalletScan(bot, chatId, walletMatch[1]);
        return;
      }
      
      // Ignore all other messages - bot only scans wallets
    });

    console.log('🤖 Telegram bot is online and listening!');
    isInitializing = false;

  } catch (error: any) {
    console.error('❌ Failed to initialize Telegram bot:', error.message);
    isInitializing = false;
  }
}

async function handleWalletScan(bot: any, chatId: number, walletAddress: string) {
  try {
    // Validate Solana address
    const pubkey = new PublicKey(walletAddress);
    const validatedAddress = pubkey.toString();
    
    // Send typing indicator
    await bot.sendChatAction(chatId, 'typing');
    
    // Scan the wallet
    const scanResult = await scanWallet(validatedAddress);
    
    const shortAddress = `${validatedAddress.slice(0, 4)}...${validatedAddress.slice(-4)}`;
    
    let message: string;
    if (scanResult.emptyAccounts > 0) {
      message = 
        `💰 *Claimable Rent Found!*\n\n` +
        `👤 Wallet: \`${validatedAddress}\`\n` +
        `🗑️ Empty Accounts: *${scanResult.emptyAccounts}*\n` +
        `💰 Claimable SOL: *~${scanResult.totalReclaimable} SOL*\n\n` +
        `🚀 [Claim Now on GetFreeSol.xyz](https://getfreesol.xyz)`;
    } else {
      message = 
        `✅ *No Claimable Rent*\n\n` +
        `👤 Wallet: \`${validatedAddress}\`\n` +
        `🗑️ Empty Accounts: *0*\n\n` +
        `This wallet has no empty token accounts to close.`;
    }
    
    await bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true 
    });
    
    console.log(`✅ Telegram: Scan complete for ${shortAddress} - ${scanResult.emptyAccounts} accounts, ${scanResult.totalReclaimable} SOL`);
    
  } catch (error: any) {
    console.error('❌ Telegram scan error:', error.message);
    await bot.sendMessage(chatId,
      `❌ Invalid Solana wallet address or scan failed.\n\nPlease check the address and try again.`
    );
  }
}

export function stopTelegramBot() {
  if (botInstance) {
    try {
      botInstance.stopPolling();
      botInstance = null;
      console.log('🛑 Telegram bot stopped');
    } catch (error) {
      console.error('Error stopping Telegram bot:', error);
    }
  }
}

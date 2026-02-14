import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createCloseAccountInstruction } from '@solana/spl-token';
import { encryptPrivateKey, decryptPrivateKey } from './pdaService';
import { db } from './db';
import { telegramAutoClaimSubscriptions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import bs58 from 'bs58';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PLATFORM_WALLET = "GETjtmGryhn2NvQovweRVU4RZHZDURoQWcioTZGcbRQS";
const PLATFORM_FEE_BPS = 1500;

const processedMessages = new Set<string>();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const RPC_URL = HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'https://api.mainnet-beta.solana.com';

const connection = new Connection(RPC_URL, 'confirmed');

interface PendingImport {
  step: 'awaiting_key' | 'awaiting_interval';
  walletAddress?: string;
  encryptedKey?: string;
  username?: string;
}

const pendingKeyImports = new Map<number, PendingImport>();

async function scanWallet(walletAddress: string): Promise<{ emptyAccounts: number; totalReclaimable: string }> {
  const pubkey = new PublicKey(walletAddress);
  
  const [tokenAccounts, token2022Accounts] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID })
  ]);

  const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];
  
  const emptyAccounts = allAccounts.filter(account => {
    const tokenAmount = account.account.data.parsed.info.tokenAmount;
    return tokenAmount.uiAmount === 0 || tokenAmount.amount === '0';
  });

  const rentPerAccount = 0.00203928;
  const totalReclaimable = (emptyAccounts.length * rentPerAccount).toFixed(6);

  return {
    emptyAccounts: emptyAccounts.length,
    totalReclaimable
  };
}

async function scanWalletDetailed(walletAddress: string) {
  const pubkey = new PublicKey(walletAddress);
  
  const [tokenAccounts, token2022Accounts] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID })
  ]);

  const emptyAccounts: { address: string; programId: PublicKey; lamports: number }[] = [];

  for (const { pubkey: accPubkey, account } of tokenAccounts.value) {
    const tokenAmount = account.data.parsed.info.tokenAmount;
    if (tokenAmount.uiAmount === 0 || tokenAmount.amount === '0') {
      emptyAccounts.push({
        address: accPubkey.toBase58(),
        programId: TOKEN_PROGRAM_ID,
        lamports: account.lamports
      });
    }
  }

  for (const { pubkey: accPubkey, account } of token2022Accounts.value) {
    const tokenAmount = account.data.parsed.info.tokenAmount;
    if (tokenAmount.uiAmount === 0 || tokenAmount.amount === '0') {
      emptyAccounts.push({
        address: accPubkey.toBase58(),
        programId: TOKEN_2022_PROGRAM_ID,
        lamports: account.lamports
      });
    }
  }

  return emptyAccounts;
}

async function executeClaimTransaction(
  walletKeypair: Keypair,
  emptyAccounts: { address: string; programId: PublicKey; lamports: number }[]
): Promise<{ signature: string; accountsClosed: number; totalRecovered: number; platformFee: number; netAmount: number }> {
  const BATCH_SIZE = 20;
  const walletPubkey = walletKeypair.publicKey;
  const platformPubkey = new PublicKey(PLATFORM_WALLET);

  let totalAccountsClosed = 0;
  let totalLamportsRecovered = 0;
  let totalPlatformFee = 0;
  let lastSignature = '';

  for (let i = 0; i < emptyAccounts.length; i += BATCH_SIZE) {
    const batch = emptyAccounts.slice(i, i + BATCH_SIZE);
    const transaction = new Transaction();
    let batchLamports = 0;

    for (const account of batch) {
      const closeIx = createCloseAccountInstruction(
        new PublicKey(account.address),
        walletPubkey,
        walletPubkey,
        [],
        account.programId
      );
      transaction.add(closeIx);
      batchLamports += account.lamports;
    }

    const platformFeeLamports = Math.floor(batchLamports * PLATFORM_FEE_BPS / 10000);
    
    if (platformFeeLamports > 0) {
      const { SystemProgram } = await import('@solana/web3.js');
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: walletPubkey,
          toPubkey: platformPubkey,
          lamports: platformFeeLamports,
        })
      );
    }

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPubkey;
    
    transaction.sign(walletKeypair);
    
    const rawTx = transaction.serialize();
    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    await connection.confirmTransaction(signature, 'confirmed');

    totalAccountsClosed += batch.length;
    totalLamportsRecovered += batchLamports;
    totalPlatformFee += platformFeeLamports;
    lastSignature = signature;

    if (i + BATCH_SIZE < emptyAccounts.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const netLamports = totalLamportsRecovered - totalPlatformFee;
  
  return {
    signature: lastSignature,
    accountsClosed: totalAccountsClosed,
    totalRecovered: totalLamportsRecovered / 1e9,
    platformFee: totalPlatformFee / 1e9,
    netAmount: netLamports / 1e9
  };
}

let botInstance: any = null;
let isInitializing = false;
let autoClaimTimer: NodeJS.Timeout | null = null;

export async function initializeTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('TELEGRAM_BOT_TOKEN not configured - Telegram bot disabled');
    return;
  }

  if (isInitializing) {
    console.log('Telegram bot is already initializing, skipping...');
    return;
  }

  if (botInstance) {
    console.log('Telegram bot is already running, skipping initialization');
    return;
  }

  isInitializing = true;

  try {
    const TelegramBot = (await import('node-telegram-bot-api')).default;
    
    const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
    botInstance = bot;

    console.log('Telegram bot is starting...');

    bot.on('polling_error', (error: any) => {
      if (error?.code === 'ETELEGRAM' && error?.message?.includes('409 Conflict')) {
        return;
      }
      console.error('Telegram polling error:', error?.message || error);
    });

    bot.onText(/\/start/, async (msg: any) => {
      const chatId = msg.chat.id;
      const username = msg.from?.username || msg.from?.first_name || 'there';
      
      try {
        await bot.sendMessage(chatId, 
          `Welcome to GetFreeSol Bot, ${username}!\n\n` +
          `I help you find and claim SOL rent from empty token accounts on Solana.\n\n` +
          `Commands:\n` +
          `/scan <wallet> - Check wallet for claimable rent\n` +
          `/autoclaim - Set up automatic rent claiming\n` +
          `/status - Check your auto-claim status\n` +
          `/stop - Stop auto-claiming\n` +
          `/help - Show help\n\n` +
          `Visit getfreesol.xyz to claim your SOL!`,
          { disable_web_page_preview: true }
        );
      } catch (err: any) {
        console.error('Telegram /start error:', err?.message || err);
      }
    });

    bot.onText(/\/help/, async (msg: any) => {
      const chatId = msg.chat.id;
      
      try {
        await bot.sendMessage(chatId,
          `GetFreeSol Bot Commands\n\n` +
          `/scan <wallet> - Scan a wallet for empty token accounts\n` +
          `/autoclaim - Set up automatic rent claiming\n` +
          `/status - Check your auto-claim subscription\n` +
          `/stop - Stop auto-claiming\n` +
          `/help - Show this help message\n\n` +
          `Tips:\n` +
          `- Just paste a wallet address to scan it\n` +
          `- Each empty account holds ~0.002 SOL in rent\n` +
          `- Auto-claim will scan and claim automatically\n` +
          `- Visit getfreesol.xyz for the full app`,
          { disable_web_page_preview: true }
        );
      } catch (err: any) {
        console.error('Telegram /help error:', err?.message || err);
      }
    });

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

    bot.onText(/\/autoclaim/, async (msg: any) => {
      const chatId = msg.chat.id;
      const messageId = `${chatId}-${msg.message_id}`;
      
      if (processedMessages.has(messageId)) return;
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 60000);

      try {
        if (msg.chat.type !== 'private') {
          await bot.sendMessage(chatId,
            'For security, auto-claim setup is only available in private messages. Please DM me directly to set it up.'
          );
          return;
        }

        const existing = await db.select()
          .from(telegramAutoClaimSubscriptions)
          .where(and(
            eq(telegramAutoClaimSubscriptions.telegramChatId, chatId.toString()),
            eq(telegramAutoClaimSubscriptions.isActive, true)
          ))
          .limit(1);

        if (existing.length > 0) {
          const sub = existing[0];
          const shortWallet = `${sub.walletAddress.slice(0, 4)}...${sub.walletAddress.slice(-4)}`;
          await bot.sendMessage(chatId,
            `You already have auto-claim active!\n\n` +
            `Wallet: ${shortWallet}\n` +
            `Interval: ${sub.interval}\n` +
            `Total Claimed: ${sub.totalClaimed} SOL\n` +
            `Accounts Closed: ${sub.totalAccountsClosed}\n\n` +
            `Use /stop to deactivate, then /autoclaim to set up again.`
          );
          return;
        }

        await bot.sendMessage(chatId,
          `Auto-Claim Setup\n\n` +
          `This feature will automatically scan your wallet and claim rent from empty token accounts at your chosen interval.\n\n` +
          `How it works:\n` +
          `1. You import your wallet private key\n` +
          `2. Choose a scan interval\n` +
          `3. Bot claims rent automatically when found\n\n` +
          `Your private key is encrypted and stored securely. A 15% platform fee applies to claimed rent.\n\n` +
          `Ready to start?`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: 'Import Wallet', callback_data: 'autoclaim_import' }
              ], [
                { text: 'Cancel', callback_data: 'autoclaim_cancel' }
              ]]
            }
          }
        );
      } catch (err: any) {
        console.error('Telegram /autoclaim error:', err?.message || err);
        await bot.sendMessage(chatId, 'Something went wrong. Please try again.').catch(() => {});
      }
    });

    bot.onText(/\/status/, async (msg: any) => {
      const chatId = msg.chat.id;
      const messageId = `${chatId}-${msg.message_id}`;
      
      if (processedMessages.has(messageId)) return;
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 60000);

      try {
        const subs = await db.select()
          .from(telegramAutoClaimSubscriptions)
          .where(eq(telegramAutoClaimSubscriptions.telegramChatId, chatId.toString()));

        const activeSub = subs.find(s => s.isActive);

        if (!activeSub) {
          await bot.sendMessage(chatId,
            `No active auto-claim subscription.\n\nUse /autoclaim to set one up!`
          );
          return;
        }

        const shortWallet = `${activeSub.walletAddress.slice(0, 4)}...${activeSub.walletAddress.slice(-4)}`;
        const lastScan = activeSub.lastScanAt ? activeSub.lastScanAt.toLocaleString() : 'Never';
        const lastClaim = activeSub.lastClaimAt ? activeSub.lastClaimAt.toLocaleString() : 'Never';

        await bot.sendMessage(chatId,
          `Auto-Claim Status\n\n` +
          `Status: Active\n` +
          `Wallet: ${shortWallet}\n` +
          `Interval: ${activeSub.interval}\n` +
          `Last Scan: ${lastScan}\n` +
          `Last Claim: ${lastClaim}\n` +
          `Total Claimed: ${activeSub.totalClaimed} SOL\n` +
          `Accounts Closed: ${activeSub.totalAccountsClosed}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: 'Change Interval', callback_data: 'change_interval' }
              ], [
                { text: 'Stop Auto-Claim', callback_data: 'autoclaim_stop_confirm' }
              ]]
            }
          }
        );
      } catch (err: any) {
        console.error('Telegram /status error:', err?.message || err);
        await bot.sendMessage(chatId, 'Something went wrong. Please try again.').catch(() => {});
      }
    });

    bot.onText(/\/stop/, async (msg: any) => {
      const chatId = msg.chat.id;
      const messageId = `${chatId}-${msg.message_id}`;
      
      if (processedMessages.has(messageId)) return;
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 60000);

      try {
        await handleStopAutoClaim(bot, chatId);
      } catch (err: any) {
        console.error('Telegram /stop error:', err?.message || err);
      }
    });

    bot.on('callback_query', async (query: any) => {
      const chatId = query.message.chat.id;
      const data = query.data;

      try {
        await bot.answerCallbackQuery(query.id);

        if (data === 'autoclaim_import') {
          pendingKeyImports.set(chatId, { step: 'awaiting_key' });
          await bot.sendMessage(chatId,
            `Please send your Solana wallet private key (base58 format).\n\n` +
            `Your key will be encrypted and stored securely. The message will be deleted after import.\n\n` +
            `Send /cancel to abort.`
          );
        } else if (data === 'autoclaim_cancel') {
          pendingKeyImports.delete(chatId);
          await bot.sendMessage(chatId, 'Auto-claim setup cancelled.');
        } else if (data?.startsWith('interval_')) {
          await handleIntervalSelection(bot, chatId, data.replace('interval_', ''));
        } else if (data === 'change_interval') {
          await showIntervalPicker(bot, chatId);
        } else if (data?.startsWith('change_to_')) {
          await handleChangeInterval(bot, chatId, data.replace('change_to_', ''));
        } else if (data === 'autoclaim_stop_confirm') {
          await handleStopAutoClaim(bot, chatId);
        }
      } catch (err: any) {
        console.error('Telegram callback error:', err?.message || err);
        await bot.sendMessage(chatId, 'Something went wrong. Please try again.').catch(() => {});
      }
    });

    bot.on('message', async (msg: any) => {
      const chatId = msg.chat.id;
      const text = msg.text?.trim();
      const messageId = `${chatId}-${msg.message_id}`;
      
      if (!text) return;
      if (processedMessages.has(messageId)) return;
      if (text.startsWith('/')) {
        if (text === '/cancel' && pendingKeyImports.has(chatId)) {
          pendingKeyImports.delete(chatId);
          processedMessages.add(messageId);
          setTimeout(() => processedMessages.delete(messageId), 60000);
          await bot.sendMessage(chatId, 'Import cancelled.').catch(() => {});
        }
        return;
      }

      const pending = pendingKeyImports.get(chatId);
      if (pending && pending.step === 'awaiting_key') {
        processedMessages.add(messageId);
        setTimeout(() => processedMessages.delete(messageId), 60000);

        if (msg.chat.type !== 'private') {
          await bot.sendMessage(chatId, 'Please send your private key in a direct message to me, not in a group chat.').catch(() => {});
          pendingKeyImports.delete(chatId);
          return;
        }

        try {
          await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        } catch (e) {}

        await handlePrivateKeyImport(bot, chatId, text, msg.from?.username);
        return;
      }
      
      const walletMatch = text.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})$/);
      
      if (walletMatch) {
        processedMessages.add(messageId);
        setTimeout(() => processedMessages.delete(messageId), 60000);
        
        await handleWalletScan(bot, chatId, walletMatch[1]);
        return;
      }
    });

    startAutoClaimScheduler(bot);

    console.log('Telegram bot is online and listening!');
    isInitializing = false;

  } catch (error: any) {
    console.error('Failed to initialize Telegram bot:', error.message);
    isInitializing = false;
  }
}

async function handlePrivateKeyImport(bot: any, chatId: number, privateKeyText: string, username?: string) {
  try {
    pendingKeyImports.delete(chatId);

    let keypair: Keypair;
    try {
      const secretKey = bs58.decode(privateKeyText);
      keypair = Keypair.fromSecretKey(secretKey);
    } catch (e) {
      await bot.sendMessage(chatId,
        'Invalid private key format. Please make sure you send a valid base58 Solana private key.\n\nUse /autoclaim to try again.'
      );
      return;
    }

    const walletAddress = keypair.publicKey.toBase58();
    const encryptedKey = encryptPrivateKey(keypair.secretKey);

    const existing = await db.select()
      .from(telegramAutoClaimSubscriptions)
      .where(and(
        eq(telegramAutoClaimSubscriptions.telegramChatId, chatId.toString()),
        eq(telegramAutoClaimSubscriptions.isActive, true)
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(telegramAutoClaimSubscriptions)
        .set({ isActive: false })
        .where(eq(telegramAutoClaimSubscriptions.id, existing[0].id));
    }

    const shortWallet = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

    await bot.sendMessage(chatId,
      `Wallet imported successfully!\n\n` +
      `Wallet: ${shortWallet}\n\n` +
      `Now choose how often to scan and claim:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Every 1 Hour', callback_data: 'interval_hourly' },
              { text: 'Every 6 Hours', callback_data: 'interval_6hours' }
            ],
            [
              { text: 'Every 12 Hours', callback_data: 'interval_12hours' },
              { text: 'Daily', callback_data: 'interval_daily' }
            ],
            [
              { text: 'Weekly', callback_data: 'interval_weekly' },
              { text: 'Monthly', callback_data: 'interval_monthly' }
            ]
          ]
        }
      }
    );

    pendingKeyImports.set(chatId, { 
      step: 'awaiting_interval',
      walletAddress,
      encryptedKey,
      username
    });

  } catch (err: any) {
    console.error('Telegram import error:', err?.message || err);
    await bot.sendMessage(chatId, 'Something went wrong during import. Please try again with /autoclaim').catch(() => {});
  }
}

async function handleIntervalSelection(bot: any, chatId: number, interval: string) {
  try {
    const pendingData = (pendingKeyImports as any).get(chatId);
    
    if (!pendingData || !pendingData.walletAddress) {
      await bot.sendMessage(chatId, 'Session expired. Please start again with /autoclaim');
      return;
    }

    const { walletAddress, encryptedKey, username } = pendingData;
    pendingKeyImports.delete(chatId);

    const intervalLabels: Record<string, string> = {
      'hourly': 'Every 1 Hour',
      '6hours': 'Every 6 Hours',
      '12hours': 'Every 12 Hours',
      'daily': 'Daily',
      'weekly': 'Weekly',
      'monthly': 'Monthly'
    };

    await db.insert(telegramAutoClaimSubscriptions).values({
      telegramChatId: chatId.toString(),
      telegramUsername: username || null,
      walletAddress,
      encryptedPrivateKey: encryptedKey,
      interval,
      isActive: true,
    });

    const shortWallet = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

    await bot.sendMessage(chatId,
      `Auto-Claim Activated!\n\n` +
      `Wallet: ${shortWallet}\n` +
      `Interval: ${intervalLabels[interval] || interval}\n` +
      `Platform Fee: 15%\n\n` +
      `The bot will scan your wallet and claim any rent from empty accounts automatically.\n\n` +
      `Commands:\n` +
      `/status - Check your subscription\n` +
      `/stop - Stop auto-claiming`
    );

    console.log(`Auto-claim activated for ${shortWallet} (${interval})`);

  } catch (err: any) {
    console.error('Telegram interval selection error:', err?.message || err);
    await bot.sendMessage(chatId, 'Something went wrong. Please try again with /autoclaim').catch(() => {});
  }
}

async function showIntervalPicker(bot: any, chatId: number) {
  await bot.sendMessage(chatId,
    'Choose a new scan interval:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Every 1 Hour', callback_data: 'change_to_hourly' },
            { text: 'Every 6 Hours', callback_data: 'change_to_6hours' }
          ],
          [
            { text: 'Every 12 Hours', callback_data: 'change_to_12hours' },
            { text: 'Daily', callback_data: 'change_to_daily' }
          ],
          [
            { text: 'Weekly', callback_data: 'change_to_weekly' },
            { text: 'Monthly', callback_data: 'change_to_monthly' }
          ]
        ]
      }
    }
  );
}

async function handleChangeInterval(bot: any, chatId: number, newInterval: string) {
  try {
    const subs = await db.select()
      .from(telegramAutoClaimSubscriptions)
      .where(and(
        eq(telegramAutoClaimSubscriptions.telegramChatId, chatId.toString()),
        eq(telegramAutoClaimSubscriptions.isActive, true)
      ))
      .limit(1);

    if (subs.length === 0) {
      await bot.sendMessage(chatId, 'No active subscription found. Use /autoclaim to set one up.');
      return;
    }

    const intervalLabels: Record<string, string> = {
      'hourly': 'Every 1 Hour',
      '6hours': 'Every 6 Hours',
      '12hours': 'Every 12 Hours',
      'daily': 'Daily',
      'weekly': 'Weekly',
      'monthly': 'Monthly'
    };

    await db.update(telegramAutoClaimSubscriptions)
      .set({ interval: newInterval })
      .where(eq(telegramAutoClaimSubscriptions.id, subs[0].id));

    await bot.sendMessage(chatId,
      `Interval updated to: ${intervalLabels[newInterval] || newInterval}\n\nYour next scan will use the new interval.`
    );
  } catch (err: any) {
    console.error('Telegram change interval error:', err?.message || err);
    await bot.sendMessage(chatId, 'Something went wrong. Please try again.').catch(() => {});
  }
}

async function handleStopAutoClaim(bot: any, chatId: number) {
  try {
    const subs = await db.select()
      .from(telegramAutoClaimSubscriptions)
      .where(and(
        eq(telegramAutoClaimSubscriptions.telegramChatId, chatId.toString()),
        eq(telegramAutoClaimSubscriptions.isActive, true)
      ));

    if (subs.length === 0) {
      await bot.sendMessage(chatId, 'No active auto-claim subscription found.');
      return;
    }

    for (const sub of subs) {
      await db.update(telegramAutoClaimSubscriptions)
        .set({ isActive: false })
        .where(eq(telegramAutoClaimSubscriptions.id, sub.id));
    }

    await bot.sendMessage(chatId,
      `Auto-claim has been stopped.\n\n` +
      `Your encrypted key has been deactivated. Use /autoclaim to set up again.`
    );
  } catch (err: any) {
    console.error('Telegram stop error:', err?.message || err);
    await bot.sendMessage(chatId, 'Something went wrong. Please try again.').catch(() => {});
  }
}

function getIntervalMs(interval: string): number {
  switch (interval) {
    case 'hourly': return 60 * 60 * 1000;
    case '6hours': return 6 * 60 * 60 * 1000;
    case '12hours': return 12 * 60 * 60 * 1000;
    case 'daily': return 24 * 60 * 60 * 1000;
    case 'weekly': return 7 * 24 * 60 * 60 * 1000;
    case 'monthly': return 30 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

function startAutoClaimScheduler(bot: any) {
  const CHECK_INTERVAL = 5 * 60 * 1000;

  autoClaimTimer = setInterval(async () => {
    try {
      const activeSubs = await db.select()
        .from(telegramAutoClaimSubscriptions)
        .where(eq(telegramAutoClaimSubscriptions.isActive, true));

      if (activeSubs.length === 0) return;

      const now = Date.now();

      for (const sub of activeSubs) {
        const intervalMs = getIntervalMs(sub.interval);
        const lastScan = sub.lastScanAt ? sub.lastScanAt.getTime() : 0;

        if (now - lastScan < intervalMs) continue;

        console.log(`Auto-claim scan for ${sub.walletAddress.slice(0, 8)}... (${sub.interval})`);

        try {
          await db.update(telegramAutoClaimSubscriptions)
            .set({ lastScanAt: new Date() })
            .where(eq(telegramAutoClaimSubscriptions.id, sub.id));

          const emptyAccounts = await scanWalletDetailed(sub.walletAddress);

          if (emptyAccounts.length === 0) {
            continue;
          }

          const secretKey = decryptPrivateKey(sub.encryptedPrivateKey);
          const keypair = Keypair.fromSecretKey(secretKey);

          const result = await executeClaimTransaction(keypair, emptyAccounts);

          const newTotalClaimed = (parseFloat(sub.totalClaimed) + result.netAmount).toFixed(9);
          const newTotalClosed = sub.totalAccountsClosed + result.accountsClosed;

          await db.update(telegramAutoClaimSubscriptions)
            .set({
              lastClaimAt: new Date(),
              totalClaimed: newTotalClaimed,
              totalAccountsClosed: newTotalClosed,
            })
            .where(eq(telegramAutoClaimSubscriptions.id, sub.id));

          const shortWallet = `${sub.walletAddress.slice(0, 4)}...${sub.walletAddress.slice(-4)}`;

          await bot.sendMessage(parseInt(sub.telegramChatId),
            `Auto-Claim Successful!\n\n` +
            `Wallet: ${shortWallet}\n` +
            `Accounts Closed: ${result.accountsClosed}\n` +
            `SOL Recovered: ${result.totalRecovered.toFixed(6)} SOL\n` +
            `Platform Fee (15%): ${result.platformFee.toFixed(6)} SOL\n` +
            `Net Received: ${result.netAmount.toFixed(6)} SOL\n\n` +
            `TX: ${result.signature.slice(0, 8)}...${result.signature.slice(-8)}\n\n` +
            `Total Claimed: ${newTotalClaimed} SOL\n` +
            `Total Accounts Closed: ${newTotalClosed}`,
            { disable_web_page_preview: true }
          ).catch(() => {});

          console.log(`Auto-claimed ${result.netAmount.toFixed(6)} SOL for ${shortWallet}`);

        } catch (err: any) {
          console.error(`Auto-claim error for ${sub.walletAddress.slice(0, 8)}...:`, err?.message || err);
          
          if (err?.message?.includes('Attempt to debit') || err?.message?.includes('insufficient')) {
            await bot.sendMessage(parseInt(sub.telegramChatId),
              `Auto-claim scan found empty accounts but your wallet doesn't have enough SOL for the transaction fee. Please add some SOL to cover network fees.`
            ).catch(() => {});
          }
        }
      }
    } catch (err: any) {
      console.error('Auto-claim scheduler error:', err?.message || err);
    }
  }, CHECK_INTERVAL);

  console.log('Auto-claim scheduler started (checks every 5 minutes)');
}

async function handleWalletScan(bot: any, chatId: number, walletAddress: string) {
  try {
    const pubkey = new PublicKey(walletAddress);
    const validatedAddress = pubkey.toString();
    
    await bot.sendChatAction(chatId, 'typing');
    
    const scanResult = await scanWallet(validatedAddress);
    
    let message: string;
    if (scanResult.emptyAccounts > 0) {
      message = 
        `Claimable Rent Found!\n\n` +
        `Wallet: ${validatedAddress}\n` +
        `Empty Accounts: ${scanResult.emptyAccounts}\n` +
        `Claimable SOL: ~${scanResult.totalReclaimable} SOL\n\n` +
        `Claim at getfreesol.xyz or use /autoclaim for automatic claiming!`;
    } else {
      message = 
        `No Claimable Rent\n\n` +
        `Wallet: ${validatedAddress}\n` +
        `Empty Accounts: 0\n\n` +
        `This wallet has no empty token accounts to close.`;
    }
    
    await bot.sendMessage(chatId, message, { 
      disable_web_page_preview: true 
    });
    
    const shortAddress = `${validatedAddress.slice(0, 4)}...${validatedAddress.slice(-4)}`;
    console.log(`Telegram: Scan complete for ${shortAddress} - ${scanResult.emptyAccounts} accounts, ${scanResult.totalReclaimable} SOL`);
    
  } catch (error: any) {
    console.error('Telegram scan error:', error.message);
    await bot.sendMessage(chatId,
      `Invalid Solana wallet address or scan failed.\n\nPlease check the address and try again.`
    );
  }
}

export function stopTelegramBot() {
  if (autoClaimTimer) {
    clearInterval(autoClaimTimer);
    autoClaimTimer = null;
  }
  if (botInstance) {
    try {
      botInstance.stopPolling();
      botInstance = null;
      console.log('Telegram bot stopped');
    } catch (error) {
      console.error('Error stopping Telegram bot:', error);
    }
  }
}

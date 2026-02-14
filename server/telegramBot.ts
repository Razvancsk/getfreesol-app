import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
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
const pendingScanWallet = new Set<number>();

const INTERVAL_LABELS: Record<string, string> = {
  'hourly': 'Every 1 Hour',
  '6hours': 'Every 6 Hours',
  '12hours': 'Every 12 Hours',
  'daily': 'Daily',
  'weekly': 'Weekly',
  'monthly': 'Monthly'
};

const MAIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '🔍 Scan Wallet', callback_data: 'menu_scan' },
      { text: '⚡ Auto-Claim', callback_data: 'menu_autoclaim' }
    ],
    [
      { text: '📊 Status', callback_data: 'menu_status' },
      { text: '🛑 Stop', callback_data: 'menu_stop' }
    ],
    [
      { text: '❓ Help', callback_data: 'menu_help' },
      { text: '🔄 Refresh', callback_data: 'menu_refresh' }
    ]
  ]
};

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
    const tokenAmount = account.account.data.parsed.info.tokenAmount;
    if (tokenAmount.uiAmount === 0 || tokenAmount.amount === '0') {
      emptyAccounts.push({ address: accPubkey.toBase58(), programId: TOKEN_PROGRAM_ID, lamports: account.lamports });
    }
  }

  for (const { pubkey: accPubkey, account } of token2022Accounts.value) {
    const tokenAmount = account.account.data.parsed.info.tokenAmount;
    if (tokenAmount.uiAmount === 0 || tokenAmount.amount === '0') {
      emptyAccounts.push({ address: accPubkey.toBase58(), programId: TOKEN_2022_PROGRAM_ID, lamports: account.lamports });
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

async function sendMainMenu(bot: any, chatId: number, username: string) {
  const activeSub = await getActiveSubscription(chatId);
  
  let statusLine = '⚪ Auto-Claim: Inactive';
  if (activeSub) {
    const shortWallet = `${activeSub.walletAddress.slice(0, 4)}...${activeSub.walletAddress.slice(-4)}`;
    statusLine = `🟢 Auto-Claim: Active\n` +
      `👛 ${shortWallet}\n` +
      `⏱ Interval: ${INTERVAL_LABELS[activeSub.interval] || activeSub.interval}\n` +
      `💰 Total Claimed: ${parseFloat(activeSub.totalClaimed).toFixed(6)} SOL\n` +
      `📦 Accounts Closed: ${activeSub.totalAccountsClosed}`;
  }

  await bot.sendMessage(chatId,
    `👋 Welcome to GetFreeSol Bot, ${username}!\n\n` +
    `Reclaim SOL rent from empty token accounts on Solana.\n\n` +
    `${statusLine}\n\n` +
    `🌐 getfreesol.xyz`,
    {
      reply_markup: MAIN_MENU_KEYBOARD,
      disable_web_page_preview: true
    }
  );
}

async function getActiveSubscription(chatId: number) {
  const subs = await db.select()
    .from(telegramAutoClaimSubscriptions)
    .where(and(
      eq(telegramAutoClaimSubscriptions.telegramChatId, chatId.toString()),
      eq(telegramAutoClaimSubscriptions.isActive, true)
    ))
    .limit(1);
  return subs.length > 0 ? subs[0] : null;
}

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
        await sendMainMenu(bot, chatId, username);
      } catch (err: any) {
        console.error('Telegram /start error:', err?.message || err);
      }
    });

    bot.onText(/\/help/, async (msg: any) => {
      try {
        await handleHelp(bot, msg.chat.id);
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

      try {
        const walletAddress = match?.[1]?.trim();
        if (!walletAddress) {
          pendingScanWallet.add(chatId);
          await bot.sendMessage(chatId,
            '🔍 Send me a Solana wallet address to scan:',
            { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_scan' }]] } }
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
        await handleAutoClaimSetup(bot, chatId, msg);
      } catch (err: any) {
        console.error('Telegram /autoclaim error:', err?.message || err);
      }
    });

    bot.onText(/\/status/, async (msg: any) => {
      const chatId = msg.chat.id;
      const messageId = `${chatId}-${msg.message_id}`;
      if (processedMessages.has(messageId)) return;
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 60000);
      try {
        await handleStatus(bot, chatId);
      } catch (err: any) {
        console.error('Telegram /status error:', err?.message || err);
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
      const username = query.from?.username || query.from?.first_name || 'there';

      try {
        await bot.answerCallbackQuery(query.id);

        if (data === 'menu_scan') {
          pendingScanWallet.add(chatId);
          await bot.sendMessage(chatId,
            '🔍 Send me a Solana wallet address to scan:',
            { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_scan' }]] } }
          );
        } else if (data === 'cancel_scan') {
          pendingScanWallet.delete(chatId);
          await bot.sendMessage(chatId, 'Scan cancelled.');

        } else if (data === 'menu_autoclaim') {
          await handleAutoClaimSetup(bot, chatId, query.message);

        } else if (data === 'menu_status') {
          await handleStatus(bot, chatId);

        } else if (data === 'menu_stop') {
          await handleStopAutoClaim(bot, chatId);

        } else if (data === 'menu_help') {
          await handleHelp(bot, chatId);

        } else if (data === 'menu_refresh') {
          await sendMainMenu(bot, chatId, username);

        } else if (data === 'back_to_menu') {
          await sendMainMenu(bot, chatId, username);

        } else if (data === 'autoclaim_import') {
          if (query.message.chat.type !== 'private') {
            await bot.sendMessage(chatId, '🔒 For security, please DM me to import your wallet.');
            return;
          }
          pendingKeyImports.set(chatId, { step: 'awaiting_key' });
          await bot.sendMessage(chatId,
            '🔑 Send your Solana wallet private key (base58 format).\n\n' +
            'Your key will be encrypted (AES-256-GCM) and stored securely.\n' +
            'The message will be deleted immediately after import.',
            { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'autoclaim_cancel' }]] } }
          );

        } else if (data === 'autoclaim_cancel') {
          pendingKeyImports.delete(chatId);
          await bot.sendMessage(chatId, 'Setup cancelled.', {
            reply_markup: { inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]] }
          });

        } else if (data?.startsWith('interval_')) {
          await handleIntervalSelection(bot, chatId, data.replace('interval_', ''));

        } else if (data === 'change_interval') {
          await showIntervalPicker(bot, chatId, 'change_to_');

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
        if (text === '/cancel') {
          pendingKeyImports.delete(chatId);
          pendingScanWallet.delete(chatId);
          processedMessages.add(messageId);
          setTimeout(() => processedMessages.delete(messageId), 60000);
          await bot.sendMessage(chatId, 'Cancelled.', {
            reply_markup: { inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]] }
          }).catch(() => {});
        }
        return;
      }

      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 60000);

      const pending = pendingKeyImports.get(chatId);
      if (pending && pending.step === 'awaiting_key') {
        if (msg.chat.type !== 'private') {
          await bot.sendMessage(chatId, '🔒 Please send your private key in a DM, not in a group.').catch(() => {});
          pendingKeyImports.delete(chatId);
          return;
        }
        try {
          await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        } catch (e) {}
        await handlePrivateKeyImport(bot, chatId, text, msg.from?.username);
        return;
      }

      if (pendingScanWallet.has(chatId)) {
        pendingScanWallet.delete(chatId);
        const walletMatch = text.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})$/);
        if (walletMatch) {
          await handleWalletScan(bot, chatId, walletMatch[1]);
        } else {
          await bot.sendMessage(chatId, '❌ Invalid wallet address. Please try again.', {
            reply_markup: { inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]] }
          });
        }
        return;
      }
      
      const walletMatch = text.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})$/);
      if (walletMatch) {
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

async function handleHelp(bot: any, chatId: number) {
  await bot.sendMessage(chatId,
    '❓ GetFreeSol Bot Help\n\n' +
    '🔍 Scan Wallet - Check any wallet for claimable SOL rent\n' +
    '⚡ Auto-Claim - Import wallet & auto-claim rent on a schedule\n' +
    '📊 Status - View your auto-claim subscription details\n' +
    '🛑 Stop - Deactivate auto-claiming\n' +
    '🔄 Refresh - Reload the main menu\n\n' +
    '💡 Tips:\n' +
    '• Paste any Solana wallet address to scan it\n' +
    '• Each empty token account holds ~0.002 SOL in rent\n' +
    '• Auto-claim scans & claims automatically at your interval\n' +
    '• 15% platform fee on claimed rent\n' +
    '• Private keys are encrypted with AES-256-GCM\n\n' +
    '🌐 getfreesol.xyz',
    {
      reply_markup: { inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]] },
      disable_web_page_preview: true
    }
  );
}

async function handleAutoClaimSetup(bot: any, chatId: number, msg: any) {
  if (msg.chat?.type !== 'private') {
    await bot.sendMessage(chatId,
      '🔒 For security, auto-claim is only available in private messages.\nPlease DM me directly.'
    );
    return;
  }

  const existing = await getActiveSubscription(chatId);

  if (existing) {
    const shortWallet = `${existing.walletAddress.slice(0, 4)}...${existing.walletAddress.slice(-4)}`;
    await bot.sendMessage(chatId,
      `⚡ Auto-Claim Already Active\n\n` +
      `👛 Wallet: ${shortWallet}\n` +
      `⏱ Interval: ${INTERVAL_LABELS[existing.interval] || existing.interval}\n` +
      `💰 Claimed: ${parseFloat(existing.totalClaimed).toFixed(6)} SOL\n` +
      `📦 Closed: ${existing.totalAccountsClosed} accounts`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏱ Change Interval', callback_data: 'change_interval' }],
            [{ text: '🛑 Stop Auto-Claim', callback_data: 'autoclaim_stop_confirm' }],
            [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
    return;
  }

  await bot.sendMessage(chatId,
    '⚡ Auto-Claim Setup\n\n' +
    'Automatically scan your wallet and claim SOL rent from empty token accounts.\n\n' +
    'How it works:\n' +
    '1️⃣ Import your wallet private key\n' +
    '2️⃣ Choose a scan interval\n' +
    '3️⃣ Bot claims rent automatically\n\n' +
    '🔒 Your key is encrypted (AES-256-GCM)\n' +
    '💰 15% platform fee on claimed rent',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔑 Import Wallet', callback_data: 'autoclaim_import' }],
          [{ text: '❌ Cancel', callback_data: 'autoclaim_cancel' }]
        ]
      }
    }
  );
}

async function handleStatus(bot: any, chatId: number) {
  const activeSub = await getActiveSubscription(chatId);

  if (!activeSub) {
    await bot.sendMessage(chatId,
      '📊 No active auto-claim subscription.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Set Up Auto-Claim', callback_data: 'menu_autoclaim' }],
            [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
    return;
  }

  const shortWallet = `${activeSub.walletAddress.slice(0, 4)}...${activeSub.walletAddress.slice(-4)}`;
  const lastScan = activeSub.lastScanAt ? activeSub.lastScanAt.toLocaleString() : 'Never';
  const lastClaim = activeSub.lastClaimAt ? activeSub.lastClaimAt.toLocaleString() : 'Never';

  await bot.sendMessage(chatId,
    `📊 Auto-Claim Status\n\n` +
    `🟢 Status: Active\n` +
    `👛 Wallet: ${shortWallet}\n` +
    `⏱ Interval: ${INTERVAL_LABELS[activeSub.interval] || activeSub.interval}\n` +
    `🔍 Last Scan: ${lastScan}\n` +
    `💸 Last Claim: ${lastClaim}\n` +
    `💰 Total Claimed: ${parseFloat(activeSub.totalClaimed).toFixed(6)} SOL\n` +
    `📦 Accounts Closed: ${activeSub.totalAccountsClosed}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⏱ Change Interval', callback_data: 'change_interval' }],
          [{ text: '🛑 Stop Auto-Claim', callback_data: 'autoclaim_stop_confirm' }],
          [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
        ]
      }
    }
  );
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
        '❌ Invalid private key format.\n\nPlease send a valid base58 Solana private key.',
        { reply_markup: { inline_keyboard: [
          [{ text: '🔑 Try Again', callback_data: 'autoclaim_import' }],
          [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
        ] } }
      );
      return;
    }

    const walletAddress = keypair.publicKey.toBase58();
    const encryptedKey = encryptPrivateKey(keypair.secretKey);

    const existing = await getActiveSubscription(chatId);
    if (existing) {
      await db.update(telegramAutoClaimSubscriptions)
        .set({ isActive: false })
        .where(eq(telegramAutoClaimSubscriptions.id, existing.id));
    }

    const shortWallet = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

    pendingKeyImports.set(chatId, { 
      step: 'awaiting_interval',
      walletAddress,
      encryptedKey,
      username
    });

    await bot.sendMessage(chatId,
      `✅ Wallet imported!\n\n` +
      `👛 ${shortWallet}\n\n` +
      `Now choose your scan interval:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⏱ 1 Hour', callback_data: 'interval_hourly' },
              { text: '⏱ 6 Hours', callback_data: 'interval_6hours' }
            ],
            [
              { text: '⏱ 12 Hours', callback_data: 'interval_12hours' },
              { text: '⏱ Daily', callback_data: 'interval_daily' }
            ],
            [
              { text: '⏱ Weekly', callback_data: 'interval_weekly' },
              { text: '⏱ Monthly', callback_data: 'interval_monthly' }
            ],
            [{ text: '❌ Cancel', callback_data: 'autoclaim_cancel' }]
          ]
        }
      }
    );
  } catch (err: any) {
    console.error('Telegram import error:', err?.message || err);
    await bot.sendMessage(chatId, 'Something went wrong. Please try again.', {
      reply_markup: { inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]] }
    }).catch(() => {});
  }
}

async function handleIntervalSelection(bot: any, chatId: number, interval: string) {
  try {
    const pendingData = pendingKeyImports.get(chatId);
    
    if (!pendingData || pendingData.step !== 'awaiting_interval' || !pendingData.walletAddress) {
      await bot.sendMessage(chatId, 'Session expired. Please start again.', {
        reply_markup: { inline_keyboard: [[{ text: '⚡ Set Up Auto-Claim', callback_data: 'menu_autoclaim' }]] }
      });
      return;
    }

    const { walletAddress, encryptedKey, username } = pendingData;
    pendingKeyImports.delete(chatId);

    await db.insert(telegramAutoClaimSubscriptions).values({
      telegramChatId: chatId.toString(),
      telegramUsername: username || null,
      walletAddress: walletAddress!,
      encryptedPrivateKey: encryptedKey!,
      interval,
      isActive: true,
    });

    const shortWallet = `${walletAddress!.slice(0, 4)}...${walletAddress!.slice(-4)}`;

    await bot.sendMessage(chatId,
      `🎉 Auto-Claim Activated!\n\n` +
      `👛 Wallet: ${shortWallet}\n` +
      `⏱ Interval: ${INTERVAL_LABELS[interval] || interval}\n` +
      `💰 Platform Fee: 15%\n\n` +
      `The bot will scan and claim rent automatically.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 View Status', callback_data: 'menu_status' }],
            [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );

    console.log(`Auto-claim activated for ${shortWallet} (${interval})`);

  } catch (err: any) {
    console.error('Telegram interval error:', err?.message || err);
    await bot.sendMessage(chatId, 'Something went wrong. Please try again.', {
      reply_markup: { inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]] }
    }).catch(() => {});
  }
}

async function showIntervalPicker(bot: any, chatId: number, prefix: string) {
  await bot.sendMessage(chatId,
    '⏱ Choose a new scan interval:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '1 Hour', callback_data: `${prefix}hourly` },
            { text: '6 Hours', callback_data: `${prefix}6hours` }
          ],
          [
            { text: '12 Hours', callback_data: `${prefix}12hours` },
            { text: 'Daily', callback_data: `${prefix}daily` }
          ],
          [
            { text: 'Weekly', callback_data: `${prefix}weekly` },
            { text: 'Monthly', callback_data: `${prefix}monthly` }
          ],
          [{ text: '◀️ Back', callback_data: 'menu_status' }]
        ]
      }
    }
  );
}

async function handleChangeInterval(bot: any, chatId: number, newInterval: string) {
  try {
    const sub = await getActiveSubscription(chatId);

    if (!sub) {
      await bot.sendMessage(chatId, 'No active subscription.', {
        reply_markup: { inline_keyboard: [[{ text: '⚡ Set Up Auto-Claim', callback_data: 'menu_autoclaim' }]] }
      });
      return;
    }

    await db.update(telegramAutoClaimSubscriptions)
      .set({ interval: newInterval })
      .where(eq(telegramAutoClaimSubscriptions.id, sub.id));

    await bot.sendMessage(chatId,
      `✅ Interval updated to: ${INTERVAL_LABELS[newInterval] || newInterval}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 View Status', callback_data: 'menu_status' }],
            [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  } catch (err: any) {
    console.error('Telegram change interval error:', err?.message || err);
    await bot.sendMessage(chatId, 'Something went wrong.').catch(() => {});
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
      await bot.sendMessage(chatId, '⚪ No active auto-claim to stop.', {
        reply_markup: { inline_keyboard: [[{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]] }
      });
      return;
    }

    for (const sub of subs) {
      await db.update(telegramAutoClaimSubscriptions)
        .set({ isActive: false })
        .where(eq(telegramAutoClaimSubscriptions.id, sub.id));
    }

    await bot.sendMessage(chatId,
      '🛑 Auto-claim stopped.\n\nYour encrypted key has been deactivated.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Set Up Again', callback_data: 'menu_autoclaim' }],
            [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  } catch (err: any) {
    console.error('Telegram stop error:', err?.message || err);
    await bot.sendMessage(chatId, 'Something went wrong.').catch(() => {});
  }
}

async function handleWalletScan(bot: any, chatId: number, walletAddress: string) {
  try {
    const pubkey = new PublicKey(walletAddress);
    const validatedAddress = pubkey.toString();
    
    await bot.sendChatAction(chatId, 'typing');
    
    const scanResult = await scanWallet(validatedAddress);
    
    const shortAddress = `${validatedAddress.slice(0, 4)}...${validatedAddress.slice(-4)}`;
    
    let message: string;
    let buttons;
    if (scanResult.emptyAccounts > 0) {
      message = 
        `💰 Claimable Rent Found!\n\n` +
        `👛 Wallet: ${shortAddress}\n` +
        `🗑 Empty Accounts: ${scanResult.emptyAccounts}\n` +
        `💰 Claimable: ~${scanResult.totalReclaimable} SOL\n\n` +
        `Claim at getfreesol.xyz or set up auto-claim!`;
      buttons = [
        [{ text: '⚡ Set Up Auto-Claim', callback_data: 'menu_autoclaim' }],
        [{ text: '🔍 Scan Another', callback_data: 'menu_scan' }],
        [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
      ];
    } else {
      message = 
        `✅ No Claimable Rent\n\n` +
        `👛 Wallet: ${shortAddress}\n` +
        `🗑 Empty Accounts: 0\n\n` +
        `No empty token accounts found.`;
      buttons = [
        [{ text: '🔍 Scan Another', callback_data: 'menu_scan' }],
        [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
      ];
    }
    
    await bot.sendMessage(chatId, message, { 
      reply_markup: { inline_keyboard: buttons },
      disable_web_page_preview: true 
    });
    
    console.log(`Telegram: Scan complete for ${shortAddress} - ${scanResult.emptyAccounts} accounts, ${scanResult.totalReclaimable} SOL`);
    
  } catch (error: any) {
    console.error('Telegram scan error:', error.message);
    await bot.sendMessage(chatId,
      '❌ Invalid wallet address or scan failed.\n\nPlease check the address and try again.',
      { reply_markup: { inline_keyboard: [
        [{ text: '🔍 Try Again', callback_data: 'menu_scan' }],
        [{ text: '◀️ Back to Menu', callback_data: 'back_to_menu' }]
      ] } }
    );
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

          if (emptyAccounts.length === 0) continue;

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
            `🎉 Auto-Claim Successful!\n\n` +
            `👛 Wallet: ${shortWallet}\n` +
            `📦 Accounts Closed: ${result.accountsClosed}\n` +
            `💰 SOL Recovered: ${result.totalRecovered.toFixed(6)} SOL\n` +
            `💸 Platform Fee (15%): ${result.platformFee.toFixed(6)} SOL\n` +
            `✅ Net Received: ${result.netAmount.toFixed(6)} SOL\n\n` +
            `🔗 TX: ${result.signature.slice(0, 8)}...${result.signature.slice(-8)}\n\n` +
            `📊 Total Claimed: ${newTotalClaimed} SOL | Closed: ${newTotalClosed}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📊 View Status', callback_data: 'menu_status' }],
                  [{ text: '◀️ Menu', callback_data: 'back_to_menu' }]
                ]
              },
              disable_web_page_preview: true
            }
          ).catch(() => {});

          console.log(`Auto-claimed ${result.netAmount.toFixed(6)} SOL for ${shortWallet}`);

        } catch (err: any) {
          console.error(`Auto-claim error for ${sub.walletAddress.slice(0, 8)}...:`, err?.message || err);
          
          if (err?.message?.includes('Attempt to debit') || err?.message?.includes('insufficient')) {
            await bot.sendMessage(parseInt(sub.telegramChatId),
              '⚠️ Auto-claim found empty accounts but your wallet needs more SOL to cover the transaction fee.',
              {
                reply_markup: { inline_keyboard: [[{ text: '◀️ Menu', callback_data: 'back_to_menu' }]] }
              }
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

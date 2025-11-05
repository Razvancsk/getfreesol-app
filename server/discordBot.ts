import { Client, GatewayIntentBits, EmbedBuilder, Message } from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Solana address validation regex (base58, 32-44 chars)
const SOLANA_ADDRESS_REGEX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

export async function initializeDiscordBot() {
  if (!DISCORD_BOT_TOKEN) {
    console.log('⚠️  DISCORD_BOT_TOKEN not configured - Discord bot disabled');
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once('ready', () => {
    console.log(`🤖 Discord bot is online as ${client.user?.tag}`);
  });

  client.on('messageCreate', async (message: Message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check for !check or !scan command
    const content = message.content.trim();
    if (!content.startsWith('!check') && !content.startsWith('!scan')) {
      return;
    }

    // Extract wallet address from command
    const parts = content.split(/\s+/);
    if (parts.length < 2) {
      await message.reply('❌ Please provide a wallet address. Usage: `!check <wallet_address>`');
      return;
    }

    const potentialAddress = parts[1];

    // Validate it's a real Solana address
    let walletAddress: string;
    try {
      const pubkey = new PublicKey(potentialAddress);
      walletAddress = pubkey.toString();
    } catch (error) {
      await message.reply('❌ Invalid Solana wallet address. Please check and try again.');
      return;
    }

    console.log(`🔍 Discord: Detected wallet address ${walletAddress} from ${message.author.tag}`);

    // Send "scanning..." message
    const scanningMessage = await message.reply('🔍 Scanning wallet for claimable rent...');

    try {
      // Scan the wallet
      const scanResult = await scanWallet(walletAddress);

      // Create embed response
      const embed = new EmbedBuilder()
        .setTitle(scanResult.emptyAccounts > 0 ? '💰 Claimable Rent Found!' : '❌ No Claimable Rent')
        .setColor(scanResult.emptyAccounts > 0 ? 0x00FF00 : 0x808080)
        .addFields(
          { name: '👤 Wallet', value: `\`${walletAddress}\``, inline: false },
          { name: '🗑️ Empty Accounts', value: `**${scanResult.emptyAccounts}**`, inline: true },
          { name: '💰 Claimable SOL', value: `**~${scanResult.totalReclaimable} SOL**`, inline: true }
        )
        .setFooter({ text: 'GetFreeSol.com • Claim your SOL today!' })
        .setTimestamp();

      if (scanResult.emptyAccounts > 0) {
        embed.addFields({
          name: '🚀 Claim Now',
          value: `Visit [GetFreeSol.com](https://getfreesol.com) to claim your rent!`,
          inline: false
        });
      }

      // Edit the scanning message with results
      await scanningMessage.edit({ content: null, embeds: [embed] });

      console.log(`✅ Discord: Scan complete for ${walletAddress} - ${scanResult.emptyAccounts} accounts, ${scanResult.totalReclaimable} SOL`);

    } catch (error) {
      console.error('❌ Discord: Error scanning wallet:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Scan Failed')
        .setColor(0xFF0000)
        .setDescription('Sorry, there was an error scanning this wallet. Please try again later or visit GetFreeSol.com')
        .setFooter({ text: 'GetFreeSol.com' })
        .setTimestamp();

      await scanningMessage.edit({ content: null, embeds: [errorEmbed] });
    }
  });

  client.login(DISCORD_BOT_TOKEN);
}

async function scanWallet(walletAddress: string): Promise<{
  emptyAccounts: number;
  totalReclaimable: string;
}> {
  // Get RPC endpoint with fallbacks
  const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
  const rpcEndpoints = [
    heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : null,
    'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
    'https://rpc.ankr.com/solana'
  ].filter(Boolean);

  let connection: Connection | null = null;

  // Try each endpoint until one works
  for (const endpoint of rpcEndpoints) {
    try {
      const testConnection = new Connection(endpoint as string, 'confirmed');
      await testConnection.getLatestBlockhash();
      connection = testConnection;
      break;
    } catch (error) {
      console.log(`RPC endpoint failed, trying next...`);
    }
  }

  if (!connection) {
    throw new Error('All RPC endpoints are currently unavailable');
  }

  const walletPublicKey = new PublicKey(walletAddress);

  // Get all token accounts for the wallet - BOTH standard Token Program AND Token-2022
  const [tokenAccounts, token2022Accounts] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(walletPublicKey, {
      programId: TOKEN_PROGRAM_ID,
    }),
    connection.getParsedTokenAccountsByOwner(walletPublicKey, {
      programId: TOKEN_2022_PROGRAM_ID,
    })
  ]);

  // Combine both standard and Token-2022 accounts
  const allTokenAccounts = [
    ...tokenAccounts.value,
    ...token2022Accounts.value
  ];

  let emptyAccountsCount = 0;
  let totalReclaimable = 0;

  for (const accountInfo of allTokenAccounts) {
    const account = accountInfo.account;
    const parsedInfo = account.data.parsed.info;

    // Check if account has zero balance
    if (parseFloat(parsedInfo.tokenAmount.amount) === 0) {
      const rentAmount = account.lamports / 1e9; // Convert lamports to SOL
      totalReclaimable += rentAmount;
      emptyAccountsCount++;
    }
  }

  return {
    emptyAccounts: emptyAccountsCount,
    totalReclaimable: totalReclaimable.toFixed(6)
  };
}

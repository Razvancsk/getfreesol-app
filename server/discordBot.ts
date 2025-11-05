import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

export async function initializeDiscordBot() {
  if (!DISCORD_BOT_TOKEN) {
    console.log('⚠️  DISCORD_BOT_TOKEN not configured - Discord bot disabled');
    return;
  }

  // Register slash commands
  await registerSlashCommands();

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

  // Handle slash command interactions
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'scan') {
      const walletAddress = interaction.options.getString('wallet', true);

      // Validate Solana address
      try {
        const pubkey = new PublicKey(walletAddress);
        const validatedAddress = pubkey.toString();

        console.log(`🔍 Discord: Scanning wallet ${validatedAddress} requested by ${interaction.user.tag}`);

        // Defer reply since scanning might take time
        await interaction.deferReply();

        try {
          // Scan the wallet
          const scanResult = await scanWallet(validatedAddress);

          // Create embed response
          const embed = new EmbedBuilder()
            .setTitle(scanResult.emptyAccounts > 0 ? '💰 Claimable Rent Found!' : '❌ No Claimable Rent')
            .setColor(scanResult.emptyAccounts > 0 ? 0x00FF00 : 0x808080)
            .addFields(
              { name: '👤 Wallet', value: `\`${validatedAddress}\``, inline: false },
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

          await interaction.editReply({ embeds: [embed] });

          console.log(`✅ Discord: Scan complete for ${validatedAddress} - ${scanResult.emptyAccounts} accounts, ${scanResult.totalReclaimable} SOL`);

        } catch (error) {
          console.error('❌ Discord: Error scanning wallet:', error);
          
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Scan Failed')
            .setColor(0xFF0000)
            .setDescription('Sorry, there was an error scanning this wallet. Please try again later or visit GetFreeSol.com')
            .setFooter({ text: 'GetFreeSol.com' })
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed] });
        }

      } catch (error) {
        // Invalid Solana address
        await interaction.reply({
          content: '❌ Invalid Solana wallet address. Please check and try again.',
          ephemeral: true
        });
      }
    }
  });

  client.login(DISCORD_BOT_TOKEN);
}

async function registerSlashCommands() {
  if (!DISCORD_BOT_TOKEN) return;

  // Extract application ID from token (first part before first dot)
  const applicationId = Buffer.from(DISCORD_BOT_TOKEN.split('.')[0], 'base64').toString();

  const commands = [
    new SlashCommandBuilder()
      .setName('scan')
      .setDescription('Scan a Solana wallet for claimable rent from empty token accounts')
      .addStringOption(option =>
        option
          .setName('wallet')
          .setDescription('Solana wallet address to scan')
          .setRequired(true)
      )
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

  try {
    console.log('🔄 Registering Discord slash commands...');
    
    await rest.put(
      Routes.applicationCommands(applicationId),
      { body: commands }
    );

    console.log('✅ Discord slash commands registered successfully');
  } catch (error) {
    console.error('❌ Failed to register Discord slash commands:', error);
  }
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

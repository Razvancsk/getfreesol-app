import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, Message } from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import OpenAI from 'openai';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Track recently processed messages to prevent duplicates
const processedMessages = new Set<string>();

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
    if (OPENAI_API_KEY) {
      console.log('🤖 AI chat assistant enabled');
    } else {
      console.log('⚠️  OpenAI API key not configured - AI chat disabled');
    }
  });

  // Handle ALL messages with AI (acts like a moderator)
  client.on('messageCreate', async (message: Message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Prevent duplicate responses using message ID
    if (processedMessages.has(message.id)) {
      return;
    }
    processedMessages.add(message.id);
    
    // Clean up old message IDs after 1 minute
    setTimeout(() => {
      processedMessages.delete(message.id);
    }, 60000);

    // Check if OpenAI is configured
    if (!OPENAI_API_KEY) {
      return;
    }

    // Get user message (remove mention if present)
    let userMessage = message.content;
    if (message.mentions.has(client.user!.id)) {
      userMessage = userMessage.replace(`<@${client.user!.id}>`, '').trim();
    }

    // Ignore very short messages
    if (!userMessage || userMessage.length < 2) {
      return;
    }

    console.log(`💬 Discord AI: Message from ${message.author.tag}: "${userMessage}"`);

    try {
      // Show typing indicator (check if method exists)
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }

      // Get AI response
      const response = await getAIResponse(userMessage);

      // Send response (split if too long)
      if (response.length <= 2000) {
        await message.reply(response);
      } else {
        // Split into chunks
        const chunks = response.match(/[\s\S]{1,1900}/g) || [];
        for (let i = 0; i < chunks.length; i++) {
          if (i === 0) {
            await message.reply(chunks[i]);
          } else {
            await message.channel.send(chunks[i]);
          }
        }
      }

      console.log(`✅ Discord AI: Responded to ${message.author.tag}`);
    } catch (error) {
      console.error('❌ Discord AI error:', error);
      await message.reply('❌ Sorry, I encountered an error. Please try again or visit https://getfreesol.xyz for help.');
    }
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
            .setFooter({ text: 'GetFreeSol.xyz • Claim your SOL today!' })
            .setTimestamp();

          if (scanResult.emptyAccounts > 0) {
            embed.addFields({
              name: '🚀 Claim Now',
              value: `Visit [GetFreeSol.xyz](https://getfreesol.xyz) to claim your rent!`,
              inline: false
            });
          }

          await interaction.editReply({ embeds: [embed] });

          console.log(`✅ Discord: Scan complete for ${validatedAddress} - ${scanResult.emptyAccounts} accounts, ${scanResult.totalReclaimable} SOL`);

          // Send webhook alert to Discord channel
          try {
            const { sendWalletCheckAlert } = await import('./discordWebhookService.js');
            await sendWalletCheckAlert({
              walletAddress: validatedAddress,
              emptyAccountsFound: scanResult.emptyAccounts,
              estimatedSOL: parseFloat(scanResult.totalReclaimable)
            });
          } catch (webhookError) {
            console.error('Failed to send Discord webhook alert:', webhookError);
          }

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

// AI Chat Response Function
async function getAIResponse(question: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const { GETFREESOL_KNOWLEDGE } = await import('./getfreesol-knowledge.js');

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
  });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a helpful customer support assistant for GetFreeSol, a platform that helps Solana users reclaim SOL from empty token accounts. 

CRITICAL INFORMATION:
- Official website: https://getfreesol.xyz (ALWAYS use this domain, NOT .com)
- We DO have a Developer API available for integration

Your role:
- Answer questions clearly and concisely (keep under 200 characters when possible)
- Be friendly and helpful
- Guide users through using the platform
- Help troubleshoot issues
- Use simple, non-technical language
- If you don't know something, direct users to visit https://getfreesol.xyz

Knowledge Base:
${GETFREESOL_KNOWLEDGE}

Important Rules:
- ALWAYS use getfreesol.xyz domain (NEVER use .com)
- Keep responses SHORT and clear (under 200 characters preferred)
- Only provide detailed answers if specifically asked
- Use Discord markdown: **bold**, [text](url)
- Never ask for private keys or seed phrases
- When mentioning the website, use format: "getfreesol.xyz" (simple, no https://)
`
        },
        {
          role: 'user',
          content: question
        }
      ],
      max_tokens: 800,
      temperature: 0.7
    });

    return completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
  } catch (error: any) {
    console.error('❌ OpenAI API error:', error.message);
    throw new Error('Failed to get AI response');
  }
}

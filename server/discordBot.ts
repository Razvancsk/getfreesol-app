import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, Message } from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import OpenAI from 'openai';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Track recently processed messages to prevent duplicates
const processedMessages = new Set<string>();

// Global client instance - ensures only one bot runs at a time
let globalClient: Client | null = null;
let isInitializing = false;

export async function initializeDiscordBot() {
  if (!DISCORD_BOT_TOKEN) {
    console.log('⚠️  DISCORD_BOT_TOKEN not configured - Discord bot disabled');
    return;
  }

  // Prevent multiple simultaneous initializations
  if (isInitializing) {
    console.log('⚠️  Discord bot is already initializing, skipping...');
    return;
  }

  if (globalClient) {
    console.log('⚠️  Discord bot is already running, skipping initialization');
    return;
  }

  isInitializing = true;

  // Register slash commands
  await registerSlashCommands();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  // Store as global instance
  globalClient = client;

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

    const content = message.content.trim();
    
    // Log all incoming messages for debugging
    console.log(`📨 Discord: Received message from ${message.author.tag}: "${content.substring(0, 50)}..."`);

    // Check for scan command (supports !, #, / prefixes or just a wallet address)
    // Supports: !scan <wallet>, #scan <wallet>, /scan <wallet>, or just <wallet>
    const scanCommandMatch = content.match(/^[!#/]scan\s*/i);
    
    // Also check if message is just a wallet address (for convenience)
    const bareWalletMatch = content.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    
    if (scanCommandMatch || bareWalletMatch) {
      let walletAddress: string;
      
      if (bareWalletMatch) {
        // User just sent a wallet address
        walletAddress = bareWalletMatch[1];
        console.log(`🔍 Discord: Bare wallet address detected: "${walletAddress}"`);
      } else {
        // Extract everything after the scan command
        const afterCommand = content.substring(scanCommandMatch![0].length).trim();
        console.log(`🔍 Discord: Scan command detected, wallet part: "${afterCommand}"`);
        
        // Try to extract a valid Solana address (base58, 32-44 chars)
        const walletMatch = afterCommand.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})/);
        if (!walletMatch) {
          console.log(`❌ Discord: No valid wallet address found in: "${afterCommand}"`);
          await message.reply('❌ Please provide a valid Solana wallet address.\n\nExample: `!scan GnV7urSN5aiRWdioX5uRaYSoykWVJaKHwWGdb8BFH9Bm`');
          return;
        }
        
        walletAddress = walletMatch[1];
      }
      
      console.log(`🔍 Discord: Text scan command for wallet ${walletAddress} from ${message.author.tag}`);
      
      try {
        // Validate Solana address
        const pubkey = new PublicKey(walletAddress);
        const validatedAddress = pubkey.toString();
        
        // Show typing indicator
        if ('sendTyping' in message.channel) {
          await message.channel.sendTyping();
        }
        
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
        
        try {
          await message.reply({ embeds: [embed] });
          console.log(`✅ Discord: Text scan complete for ${validatedAddress} - ${scanResult.emptyAccounts} accounts, ${scanResult.totalReclaimable} SOL`);
        } catch (replyError: any) {
          console.error('❌ Failed to send scan result (missing permissions?):', replyError.message);
          // Try sending without reply (just a message)
          try {
            if ('send' in message.channel) {
              await message.channel.send({ embeds: [embed] });
              console.log(`✅ Discord: Sent scan result without reply for ${validatedAddress}`);
            }
          } catch (sendError: any) {
            console.error('❌ Failed to send message at all:', sendError.message);
          }
        }
        
        // Send webhook alert
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
        
      } catch (error: any) {
        console.error('❌ Discord text scan error:', error);
        try {
          await message.reply('❌ Invalid Solana wallet address or scan failed. Please check the address and try again.');
        } catch (replyError: any) {
          console.error('❌ Failed to send error reply (missing permissions?):', replyError.message);
        }
      }
      
      return; // Don't process as AI message
    }

    // Check if OpenAI is configured
    if (!OPENAI_API_KEY) {
      return;
    }

    // AI only responds when someone mentions the bot (@GetFreeSol Bot) or DMs
    const isMentioned = message.mentions.has(client.user!.id);
    const isDM = message.channel.isDMBased();
    
    // Skip if not mentioned or DM - no more responding to questions in channels
    if (!isMentioned && !isDM) {
      return;
    }

    // Get user message (remove mention if present)
    let userMessage = message.content;
    if (isMentioned) {
      userMessage = userMessage.replace(`<@${client.user!.id}>`, '').trim();
    }

    // Ignore messages that look like scan commands
    if (userMessage.toLowerCase().includes('scan') || 
        userMessage.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/) ||
        userMessage.startsWith('!') || 
        userMessage.startsWith('#') || 
        userMessage.startsWith('/')) {
      console.log(`💬 Discord AI: Skipping command-like message: "${userMessage}"`);
      return;
    }

    // Ignore very short messages
    if (!userMessage || userMessage.length < 3) {
      return;
    }

    console.log(`💬 Discord AI: Processing message ID ${message.id} from ${message.author.tag}: "${userMessage}"`);

    try {
      // Show typing indicator (check if method exists)
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }

      // Get AI response
      console.log(`🤖 Calling OpenAI for message ${message.id}...`);
      const response = await getAIResponse(userMessage);
      console.log(`✅ OpenAI responded for message ${message.id}, length: ${response.length}`);

      // Send response (split if too long)
      console.log(`📤 Sending reply for message ${message.id}...`);
      if (response.length <= 2000) {
        await message.reply(response);
        console.log(`✅ Reply sent for message ${message.id}`);
      } else {
        // Split into chunks
        const chunks = response.match(/[\s\S]{1,1900}/g) || [];
        console.log(`📝 Split response into ${chunks.length} chunks for message ${message.id}`);
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (!chunk) continue;
          
          if (i === 0) {
            await message.reply(chunk);
          } else if ('send' in message.channel) {
            await message.channel.send(chunk);
          }
        }
        console.log(`✅ All ${chunks.length} chunks sent for message ${message.id}`);
      }

      console.log(`✅ Discord AI: Fully responded to ${message.author.tag} for message ${message.id}`);
    } catch (error: any) {
      console.error('❌ Discord AI error:', error);
      
      // Handle permission errors gracefully
      if (error.code === 50001 || error.code === 50013) {
        console.log('⚠️  Bot lacks permissions in this channel, skipping response');
        return;
      }
      
      try {
        await message.reply('❌ Sorry, I encountered an error. Please try again or visit https://getfreesol.xyz for help.');
      } catch (replyError) {
        console.error('❌ Failed to send error message:', replyError);
      }
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
            .setDescription('Sorry, there was an error scanning this wallet. Please try again later or visit [GetFreeSol.xyz](https://getfreesol.xyz)')
            .setFooter({ text: 'GetFreeSol.xyz • Claim your SOL today!' })
            .setTimestamp();

          try {
            await interaction.editReply({ embeds: [errorEmbed] });
          } catch (replyError) {
            console.error('❌ Discord: Failed to send error message:', replyError);
          }
        }

      } catch (error) {
        // Invalid Solana address
        try {
          await interaction.reply({
            content: '❌ Invalid Solana wallet address. Please check and try again.',
            ephemeral: true
          });
        } catch (replyError) {
          console.error('❌ Failed to send invalid address error:', replyError);
        }
      }
    }
  });

  await client.login(DISCORD_BOT_TOKEN);
  
  isInitializing = false;
  console.log('✅ Discord bot initialization complete');

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('🛑 Shutting down Discord bot...');
    if (globalClient) {
      await globalClient.destroy();
      globalClient = null;
      isInitializing = false;
    }
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down Discord bot...');
    if (globalClient) {
      await globalClient.destroy();
      globalClient = null;
      isInitializing = false;
    }
  });
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
- When mentioning the website, ALWAYS use clickable link format: [getfreesol.xyz](https://getfreesol.xyz) or just https://getfreesol.xyz
- NEVER use plain text "getfreesol.xyz" - always make it clickable
- NEVER put a period directly after links
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

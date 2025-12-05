import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MEME_PROMPTS = [
  "Pepe the frog wearing a hoodie at 3am discovering hidden SOL in his wallet, green frog meme, degen crypto style, dark monitor glow background, internet meme aesthetic",
  "Wojak with laser eyes burning rugged shitcoins, Solana degen meme style, pink wojak, flames and SOL coins flying, raw internet meme look",
  "Before and after wojak meme: left side crying pink wojak with rugged tokens, right side smug pepe with stack of SOL, classic meme template style",
  "Galaxy brain expanding meme format, small brain holding shitcoins, huge glowing brain cleaning Solana wallet recovering SOL, degen meme style",
  "Gigachad sigma male face cleaning his Solana wallet, flexing recovered SOL, meme aesthetic, bold dramatic lighting, crypto degen culture",
  "Pepe frog sweating nervously at computer screen showing 500 empty token accounts, Solana degen meme, sweating pepe format",
  "Smug Pepe throwing rugged NFTs into trash and receiving shiny SOL coins, recycling meme, degen crypto aesthetic, green frog",
  "Wojak vs Chad meme: virgin wojak holding worthless tokens, chad holding cleaned Solana wallet with recovered SOL, classic meme format",
  "Distracted boyfriend meme style: boyfriend looking at recovered SOL, girlfriend as worthless shitcoins, classic internet meme aesthetic",
  "Pepe millionaire meme, frog in suit counting recovered SOL from wallet cleanup, smug rich pepe, degen crypto success meme",
  "Drake meme format: drake rejecting rugged tokens, drake approving wallet cleanup recovering SOL, Solana degen style",
  "Stonks meme guy but for Solana wallet cleanup, arrow going up, recovered SOL gains, classic meme man aesthetic",
  "This is fine dog in burning room but the fire is worthless tokens and dog is happy Solana degen, classic meme format",
  "Crying wojak turning into gigachad after cleaning Solana wallet and recovering SOL, transformation meme, degen crypto style",
  "Pepe holding bag of rugged tokens on left, same pepe as wealthy frog with SOL stack on right, degen success story meme",
];

export async function generateMemeFunnyImage(): Promise<{ imageBuffer: Buffer; prompt: string } | null> {
  try {
    const randomPrompt = MEME_PROMPTS[Math.floor(Math.random() * MEME_PROMPTS.length)];
    
    console.log('[AI Meme] Generating image with prompt:', randomPrompt);
    
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: `${randomPrompt}. Style: classic internet meme format, degen crypto culture, Solana themed, raw meme aesthetic like from crypto twitter or discord. NO TEXT ON IMAGE - visual meme only.`,
      n: 1,
      size: "1024x1024",
    });

    if (response.data && response.data[0]) {
      const imageData = response.data[0];
      
      if (imageData.b64_json) {
        const imageBuffer = Buffer.from(imageData.b64_json, 'base64');
        console.log('[AI Meme] Image generated successfully from base64');
        return { imageBuffer, prompt: randomPrompt };
      } else if (imageData.url) {
        const imageResponse = await fetch(imageData.url);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        console.log('[AI Meme] Image generated successfully from URL');
        return { imageBuffer, prompt: randomPrompt };
      }
    }
    
    console.log('[AI Meme] No image data in response');
    return null;
  } catch (error: any) {
    console.error('[AI Meme] Error generating image:', error.message);
    return null;
  }
}

export async function generateCustomMemeImage(customPrompt: string): Promise<Buffer | null> {
  try {
    console.log('[AI Meme] Generating custom image with prompt:', customPrompt);
    
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: `${customPrompt}. Style: classic internet meme format, degen crypto culture, Solana themed, raw meme aesthetic like from crypto twitter or discord. NO TEXT ON IMAGE - visual meme only.`,
      n: 1,
      size: "1024x1024",
    });

    if (response.data && response.data[0]) {
      const imageData = response.data[0];
      
      if (imageData.b64_json) {
        return Buffer.from(imageData.b64_json, 'base64');
      } else if (imageData.url) {
        const imageResponse = await fetch(imageData.url);
        const arrayBuffer = await imageResponse.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    }
    
    return null;
  } catch (error: any) {
    console.error('[AI Meme] Error generating custom image:', error.message);
    return null;
  }
}

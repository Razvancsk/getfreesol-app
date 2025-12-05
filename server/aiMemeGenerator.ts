import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MEME_PROMPTS = [
  "Pepe the frog wearing a hoodie at 3am discovering hidden SOL rent in empty token accounts, green frog meme, degen crypto style, dark monitor glow, coins appearing from wallet",
  "Wojak shocked face discovering he has 0.5 SOL locked in rent deposits, Solana degen meme style, pink wojak, SOL coins everywhere",
  "Before and after wojak meme: left side broke wojak, right side rich pepe after reclaiming rent from 200 empty accounts, classic meme template",
  "Galaxy brain expanding meme format, small brain ignoring empty accounts, huge glowing brain reclaiming SOL rent deposits, degen meme style",
  "Gigachad sigma male face closing empty Solana token accounts, flexing reclaimed rent SOL, meme aesthetic, bold dramatic lighting",
  "Pepe frog excited at computer screen showing rent refund from closing empty accounts, Solana degen meme, happy pepe with SOL coins",
  "Smug Pepe closing old token accounts and receiving rent deposits back as SOL coins, recycling meme, degen crypto aesthetic",
  "Wojak vs Chad meme: virgin wojak with 500 empty accounts, chad closing accounts and stacking rent SOL, classic meme format",
  "Distracted boyfriend meme style: boyfriend looking at rent reclaim SOL, girlfriend as empty token accounts, classic internet meme",
  "Pepe millionaire meme, frog in suit counting SOL from closed empty accounts, smug rich pepe holding rent refunds, degen success",
  "Drake meme format: drake ignoring empty token accounts, drake approving rent reclaim getting free SOL, Solana degen style",
  "Stonks meme guy but for Solana rent reclaim, arrow going up, reclaimed SOL gains from closing accounts, classic meme man",
  "Pepe celebrating with SOL coins raining down after closing 100 empty token accounts and getting rent back, party pepe meme",
  "Crying wojak turning into gigachad after discovering hidden SOL rent in old wallet accounts, transformation meme, degen style",
  "Pepe looking at empty wallet on left, same pepe as wealthy frog with stack of reclaimed rent SOL on right, success story meme",
  "Wojak with laser eyes burning rugged shitcoins and reclaiming rent SOL, flames and coins flying, raw internet meme look",
  "This is fine dog but happy because hes closing empty accounts and recovering rent deposits, classic meme format, SOL coins",
  "Pepe treasure hunter meme, frog finding hidden SOL rent deposits buried in old empty token accounts, adventure degen style",
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

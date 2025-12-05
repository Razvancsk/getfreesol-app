import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MEME_PROMPTS = [
  "A cartoon degen wojak character discovering hidden treasure (SOL coins) inside an old dusty wallet, crypto meme style, simple flat colors, dark background",
  "A happy cartoon face surrounded by flames saying 'this is fine' while burning worthless crypto tokens, meme style, bold colors",
  "Before and after meme: left side sad wojak with empty pockets, right side happy wojak with stack of SOL coins, crypto meme style",
  "A cartoon brain expanding/glowing meme with crypto wallet cleanup theme, galaxy brain style, purple and green colors",
  "A cartoon degen character at 3am on computer burning shitcoins, funny crypto meme style, dark room with monitor glow",
  "A cartoon trash can overflowing with worthless tokens being converted into shiny SOL coins, crypto meme style",
  "POV meme: shocked cartoon face discovering 200 empty token accounts in wallet, crypto degen style",
  "A cartoon broom sweeping away rugged tokens revealing hidden SOL underneath, cleanup theme, crypto meme style",
  "Gigachad cartoon character proudly cleaning their Solana wallet, recovering SOL, crypto meme style",
  "A cartoon recycling symbol with worthless NFTs going in and SOL coins coming out, crypto meme style",
];

export async function generateMemeFunnyImage(): Promise<{ imageBuffer: Buffer; prompt: string } | null> {
  try {
    const randomPrompt = MEME_PROMPTS[Math.floor(Math.random() * MEME_PROMPTS.length)];
    
    console.log('[AI Meme] Generating image with prompt:', randomPrompt);
    
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: `${randomPrompt}. Style: internet meme, cartoon, simple, bold text-free, humorous, crypto/Solana themed. NO TEXT ON IMAGE.`,
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
      prompt: `${customPrompt}. Style: internet meme, cartoon, simple, bold, humorous, crypto/Solana themed. NO TEXT ON IMAGE - image only.`,
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

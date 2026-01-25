import { createCanvas, loadImage } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CardBannerOptions {
  solAmount: string;
  walletAddress: string;
}

export async function generateClaimCardBanner(options: CardBannerOptions): Promise<Buffer> {
  const { solAmount, walletAddress } = options;
  
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#6b21a8');
  bgGradient.addColorStop(1, '#581c87');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 100px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLAIMED', width / 2, 160);

  const solText = `+ ${parseFloat(solAmount).toFixed(4)} SOL`;
  ctx.font = 'bold 130px sans-serif';
  ctx.fillText(solText, width / 2, 310);

  ctx.font = '40px sans-serif';
  ctx.fillText('Claimer:', width / 2, 390);

  ctx.font = '24px sans-serif';
  ctx.fillText(walletAddress, width / 2, 440);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'right';
  const getFreeSolText = 'GET FREE SOL';
  const textMetrics = ctx.measureText(getFreeSolText);
  const textWidth = textMetrics.width;
  const textEndX = width - 25;
  const textStartX = textEndX - textWidth;
  const textCenterX = textStartX + (textWidth / 2);
  
  ctx.fillText(getFreeSolText, width - 25, height - 80);

  try {
    const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
    const logo = await loadImage(logoPath);
    const logoSize = 120;
    const logoX = textCenterX - (logoSize / 2);
    ctx.drawImage(logo, logoX, height - 220, logoSize, logoSize);
  } catch (error) {
    console.error('Failed to load logo:', error);
  }

  return canvas.toBuffer('image/png');
}

export interface ShareCardOptions {
  solAmount: string;
  itemCount: number;
  claimType: 'accounts' | 'tokens' | 'nfts';
}

export async function generateShareCardStyle2(options: ShareCardOptions): Promise<Buffer> {
  const { solAmount, itemCount, claimType } = options;
  
  const width = 1200;
  const height = 675; // 16:9 aspect ratio
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient - dark purple matching website from-[#1a0a2e] via-[#2d1b4e] to-[#1a0a2e]
  const bgGradient = ctx.createLinearGradient(0, 0, width, 0);
  bgGradient.addColorStop(0, '#1a0a2e');
  bgGradient.addColorStop(0.5, '#2d1b4e');
  bgGradient.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative diagonal - purple accent matching website from-purple-600/40 to-purple-800/60
  const diagonalGradient = ctx.createLinearGradient(width * 0.5, 0, width, height);
  diagonalGradient.addColorStop(0, 'rgba(147, 51, 234, 0.4)');
  diagonalGradient.addColorStop(1, 'rgba(107, 33, 168, 0.6)');
  ctx.fillStyle = diagonalGradient;
  ctx.beginPath();
  ctx.moveTo(width * 0.6, 0);
  ctx.lineTo(width, 0);
  ctx.lineTo(width, height);
  ctx.lineTo(width * 0.25, height);
  ctx.closePath();
  ctx.fill();

  // Logo and branding (top left)
  try {
    const logoPath = path.join(__dirname, '../attached_assets/image_1757882056840.png');
    const logo = await loadImage(logoPath);
    ctx.drawImage(logo, 50, 45, 90, 90);
  } catch (error) {
    console.error('Failed to load logo:', error);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GET FREE SOL', 160, 105);

  // CLAIMED text (green) - using italic bold like website
  ctx.fillStyle = '#4ade80';
  ctx.font = 'italic bold 72px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLAIMED', width / 2, 280);

  // SOL amount (white, large) - extra bold weight (font-black = 900)
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 110px Arial, Helvetica, sans-serif';
  ctx.fillText(`+ ${parseFloat(solAmount).toFixed(4)} SOL`, width / 2, 410);

  // Claim type text - exact match: text-green-400 (#4ade80), font-mono
  ctx.fillStyle = 'rgb(74, 222, 128)';
  ctx.font = 'normal 32px "Courier New", Courier, monospace';
  let claimText = '';
  if (claimType === 'tokens') {
    claimText = `by burning ${itemCount} token${itemCount > 1 ? 's' : ''}!`;
  } else if (claimType === 'nfts') {
    claimText = `by burning ${itemCount} NFT${itemCount > 1 ? 's' : ''}!`;
  } else {
    claimText = `by closing ${itemCount} empty account${itemCount > 1 ? 's' : ''}!`;
  }
  ctx.fillText(claimText, width / 2, 500);

  return canvas.toBuffer('image/png');
}

function drawGeometricGLogo(ctx: any, x: number, y: number) {
  const width = 90;
  const height = 80;
  
  ctx.fillStyle = '#a78bfa';
  roundRect(ctx, x, y, width, height * 0.45, 4);
  ctx.fill();

  ctx.fillStyle = '#7c3aed';
  roundRect(ctx, x, y + height * 0.55, width, height * 0.45, 4);
  ctx.fill();
}

function roundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawHexagon(ctx: any, x: number, y: number, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const hx = x + size * Math.cos(angle);
    const hy = y + size * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(hx, hy);
    } else {
      ctx.lineTo(hx, hy);
    }
  }
  ctx.closePath();
  ctx.stroke();
}

function drawDiagonalLines(ctx: any, width: number, height: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = -height; i < width + height; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
    ctx.stroke();
  }
}

function drawDotGrid(ctx: any, width: number, height: number, color: string) {
  ctx.fillStyle = color;
  for (let x = 30; x < width; x += 50) {
    for (let y = 30; y < height; y += 50) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWaveLines(ctx: any, width: number, height: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let y = 50; y < height; y += 80) {
    ctx.beginPath();
    for (let x = 0; x < width; x += 5) {
      const waveY = y + Math.sin(x * 0.02) * 20;
      if (x === 0) ctx.moveTo(x, waveY);
      else ctx.lineTo(x, waveY);
    }
    ctx.stroke();
  }
}

function drawTriangles(ctx: any, width: number, height: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = 30 + Math.random() * 50;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
    ctx.fill();
  }
}

function drawParticles(ctx: any, width: number, height: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 4 + 1;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGlowOrbs(ctx: any, width: number, height: number, colors: string[]) {
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = 100 + Math.random() * 150;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, colors[i % colors.length]);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export async function generatePostCardBanner(type: string = 'promo'): Promise<Buffer> {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const template = Math.floor(Math.random() * 10);
  
  if (type === 'gm') {
    if (template === 0) {
      // Sunrise gradient - warm orange/yellow
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#fbbf24');
      gradient.addColorStop(1, '#f97316');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawDiagonalLines(ctx, width, height, 'rgba(255,255,255,0.1)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width - 150, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1e1b4b';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText('GM', 80, 200);
      ctx.font = 'bold 80px sans-serif';
      ctx.fillText('SOLANA!', 80, 300);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '44px sans-serif';
      ctx.fillText('New day, new opportunities', 80, 400);
      
      ctx.font = 'bold 50px sans-serif';
      ctx.fillStyle = '#1e1b4b';
      ctx.fillText('getfreesol.xyz', 80, 520);
      
    } else if (template === 1) {
      // Dark with glow orbs
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      drawGlowOrbs(ctx, width, height, ['rgba(251,191,36,0.3)', 'rgba(249,115,22,0.2)', 'rgba(234,88,12,0.2)', 'rgba(220,38,38,0.15)']);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 140px sans-serif';
      ctx.fillText('GM', width / 2, 250);
      
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('SOLANA FAM', width / 2, 340);
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = '36px sans-serif';
      ctx.fillText('Wishing you a productive day', width / 2, 440);
      
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 550);
      
    } else if (template === 2) {
      // Split purple/gold
      ctx.fillStyle = '#6b21a8';
      ctx.fillRect(0, 0, width / 2, height);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(width / 2, 0, width / 2, height);
      drawDotGrid(ctx, width, height, 'rgba(255,255,255,0.1)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, height - 150, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('GM', width / 4, 280);
      
      ctx.fillStyle = '#1e1b4b';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('FRENS', width * 3/4, 280);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '40px sans-serif';
      ctx.fillText('Rise and shine', width / 4, 400);
      
      ctx.fillStyle = '#1e1b4b';
      ctx.font = '40px sans-serif';
      ctx.fillText('getfreesol.xyz', width * 3/4, 400);
      
    } else if (template === 3) {
      // Radial sunrise
      const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, 600);
      gradient.addColorStop(0, '#fef3c7');
      gradient.addColorStop(1, '#f97316');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawWaveLines(ctx, width, height, 'rgba(0,0,0,0.05)');
      
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(width/2, 200, 120, 0, Math.PI * 2);
      ctx.fill();
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 60, 140, 120, 120);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1e1b4b';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('GOOD MORNING', width / 2, 400);
      
      ctx.fillStyle = '#7c3aed';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 500);
      
      ctx.fillStyle = '#374151';
      ctx.font = '32px sans-serif';
      ctx.fillText('Have an amazing day ahead', width / 2, 570);
      
    } else if (template === 4) {
      // Purple with gold border
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, width, height);
      drawTriangles(ctx, width, height, 'rgba(139,92,246,0.2)');
      
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 40, width - 80, height - 80);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 50, 80, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 110px sans-serif';
      ctx.fillText('GM SOLANA', width / 2, 300);
      
      ctx.fillStyle = '#a78bfa';
      ctx.font = '42px sans-serif';
      ctx.fillText('Lets build something great today', width / 2, 400);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 520);
      
    } else if (template === 5) {
      // Teal/cyan morning vibe
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#0d9488');
      gradient.addColorStop(1, '#06b6d4');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawParticles(ctx, width, height, 'rgba(255,255,255,0.3)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 60, 60, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 130px sans-serif';
      ctx.fillText('GM', width / 2, 250);
      
      ctx.fillStyle = '#ecfeff';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('HAPPY MONDAY', width / 2, 340);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '38px sans-serif';
      ctx.fillText('Start your week strong', width / 2, 440);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 550);
      
    } else if (template === 6) {
      // Pink/purple gradient
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#ec4899');
      gradient.addColorStop(1, '#8b5cf6');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawDotGrid(ctx, width, height, 'rgba(255,255,255,0.15)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 60, 40, 120, 120);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('GM EVERYONE', width / 2, 280);
      
      ctx.fillStyle = '#fef3c7';
      ctx.font = '45px sans-serif';
      ctx.fillText('Sending good vibes to the community', width / 2, 380);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 520);
      
    } else if (template === 7) {
      // Dark green forest morning
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(0, 0, width, height);
      drawWaveLines(ctx, width, height, 'rgba(16,185,129,0.2)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width - 150, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 110px sans-serif';
      ctx.fillText('GM', 80, 220);
      
      ctx.fillStyle = '#6ee7b7';
      ctx.font = 'bold 70px sans-serif';
      ctx.fillText('SOLANA BUILDERS', 80, 320);
      
      ctx.fillStyle = '#a7f3d0';
      ctx.font = '40px sans-serif';
      ctx.fillText('Another day to create something amazing', 80, 420);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', 80, 530);
      
    } else if (template === 8) {
      // Minimal white/clean
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, width, height);
      
      // Subtle gradient overlay
      const overlay = ctx.createLinearGradient(0, 0, width, height);
      overlay.addColorStop(0, 'rgba(251,191,36,0.1)');
      overlay.addColorStop(1, 'rgba(249,115,22,0.1)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, width, height);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 60, 60, 120, 120);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1e1b4b';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText('GM', width / 2, 300);
      
      ctx.fillStyle = '#6b7280';
      ctx.font = '42px sans-serif';
      ctx.fillText('Simple greeting, big energy', width / 2, 400);
      
      ctx.fillStyle = '#7c3aed';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 520);
      
    } else {
      // Retro/vaporwave style
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#7c3aed');
      gradient.addColorStop(0.5, '#ec4899');
      gradient.addColorStop(1, '#f97316');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 130px sans-serif';
      ctx.fillText('GM', width / 2, 280);
      
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('RISE AND SHINE', width / 2, 370);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '38px sans-serif';
      ctx.fillText('Time to check your wallet', width / 2, 460);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 560);
    }
    
  } else if (type === 'gn') {
    if (template === 0) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0f0a1e');
      gradient.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawParticles(ctx, width, height, 'rgba(255,255,255,0.5)');
      
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(width - 120, 100, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f0a1e';
      ctx.beginPath();
      ctx.arc(width - 100, 90, 40, 0, Math.PI * 2);
      ctx.fill();
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c4b5fd';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText('GN SOLANA', width / 2, 300);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '44px sans-serif';
      ctx.fillText('Rest well, your SOL is safe', width / 2, 400);
      
      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 540);
      
    } else if (template === 1) {
      ctx.fillStyle = '#0c1929';
      ctx.fillRect(0, 0, width, height);
      drawWaveLines(ctx, width, height, 'rgba(147,197,253,0.1)');
      
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
        ctx.beginPath();
        ctx.arc(Math.random() * width, Math.random() * height * 0.5, Math.random() * 2 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width - 150, height - 150, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('GOODNIGHT', 80, 250);
      
      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 70px sans-serif';
      ctx.fillText('SOLANA', 80, 340);
      
      ctx.fillStyle = '#38bdf8';
      ctx.font = '40px sans-serif';
      ctx.fillText('Sweet dreams, more SOL awaits', 80, 440);
      
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 45px sans-serif';
      ctx.fillText('getfreesol.xyz', 80, 540);
      
    } else if (template === 2) {
      ctx.fillStyle = '#1a0a2e';
      ctx.fillRect(0, 0, width, height);
      drawGlowOrbs(ctx, width, height, ['rgba(168,85,247,0.2)', 'rgba(192,132,252,0.15)', 'rgba(139,92,246,0.2)', 'rgba(124,58,237,0.15)']);
      
      ctx.fillStyle = '#fae8ff';
      ctx.beginPath();
      ctx.arc(100, 100, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0a2e';
      ctx.beginPath();
      ctx.arc(120, 85, 50, 0, Math.PI * 2);
      ctx.fill();
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 50, 100, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e879f9';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('GN', width / 2, 320);
      ctx.fillStyle = '#f0abfc';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('SOLANA', width / 2, 420);
      
      ctx.fillStyle = '#d8b4fe';
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 560);
      
    } else if (template === 3) {
      ctx.fillStyle = '#0a0908';
      ctx.fillRect(0, 0, width, height);
      
      ctx.strokeStyle = 'rgba(163,163,163,0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 60) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }
      for (let i = 0; i < height; i += 60) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
      }
      
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(width - 150, 120, 45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0908';
      ctx.beginPath();
      ctx.arc(width - 135, 110, 38, 0, Math.PI * 2);
      ctx.fill();
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 80, 80);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a3a3a3';
      ctx.font = 'bold 130px sans-serif';
      ctx.fillText('GN', width / 2, 300);
      
      ctx.fillStyle = '#737373';
      ctx.font = '50px sans-serif';
      ctx.fillText('Sleep tight, stack SOL tomorrow', width / 2, 420);
      
      ctx.fillStyle = '#fcd34d';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 550);
      
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#312e81';
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(width, height);
      ctx.lineTo(width, height * 0.4);
      ctx.lineTo(0, height * 0.6);
      ctx.closePath();
      ctx.fill();
      
      drawParticles(ctx, width, height * 0.5, 'rgba(255,255,255,0.6)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, height - 130, 80, 80);
      } catch (e) {}
      
      ctx.textAlign = 'right';
      ctx.fillStyle = '#c4b5fd';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('GOODNIGHT', width - 80, 200);
      
      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('SOLANA FAM', width - 80, 290);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '38px sans-serif';
      ctx.fillText('Tomorrow brings more SOL to reclaim', width - 80, 400);
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', 80, height - 60);
    }
    
  } else if (type === 'stats') {
    if (template === 0) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#1e1b4b');
      gradient.addColorStop(1, '#312e81');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawDotGrid(ctx, width, height, 'rgba(167,139,250,0.15)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('PLATFORM STATS', width / 2, 200);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText('100+ SOL', width / 2, 350);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '38px sans-serif';
      ctx.fillText('Total SOL Recovered', width / 2, 440);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 550);
      
    } else if (template === 1) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      drawGlowOrbs(ctx, width, height, ['rgba(52,211,153,0.25)', 'rgba(167,139,250,0.2)', 'rgba(251,191,36,0.15)', 'rgba(34,211,238,0.15)']);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width - 150, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '45px sans-serif';
      ctx.fillText('STATS', 80, 180);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 130px sans-serif';
      ctx.fillText('100+', 80, 320);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 70px sans-serif';
      ctx.fillText('SOL RECOVERED', 80, 410);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', 80, 550);
      
    } else if (template === 2) {
      ctx.fillStyle = '#34d399';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#059669';
      ctx.fillRect(0, height * 0.6, width, height * 0.4);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 140px sans-serif';
      ctx.fillText('100+ SOL', width / 2, 280);
      
      ctx.fillStyle = '#1e1b4b';
      ctx.font = '50px sans-serif';
      ctx.fillText('Recovered by Community', width / 2, 380);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 530);
      
    } else if (template === 3) {
      ctx.fillStyle = '#0f0326';
      ctx.fillRect(0, 0, width, height);
      
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 4;
      ctx.strokeRect(50, 50, width - 100, height - 100);
      
      drawDiagonalLines(ctx, width, height, 'rgba(139,92,246,0.1)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 50, 80, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a78bfa';
      ctx.font = '50px sans-serif';
      ctx.fillText('COMMUNITY STATS', width / 2, 280);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('100+ SOL', width / 2, 400);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 530);
      
    } else {
      ctx.fillStyle = '#4c1d95';
      ctx.fillRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#7c3aed');
      gradient.addColorStop(1, '#4c1d95');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawParticles(ctx, width, height, 'rgba(255,255,255,0.3)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, height - 150, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('PLATFORM STATS', width - 80, 150);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText('100+', width - 80, 300);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 80px sans-serif';
      ctx.fillText('SOL', width - 80, 400);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '40px sans-serif';
      ctx.fillText('Recovered by our community', width - 80, 480);
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', 80, height - 70);
    }
    
  } else if (type === 'funny') {
    if (template === 0) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 45px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ME LOOKING AT MY WALLET', width/2, 60);
      
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(50, 100, width/2 - 80, height - 150);
      ctx.fillRect(width/2 + 30, 100, width/2 - 80, height - 150);
      
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 35px sans-serif';
      ctx.fillText('BEFORE', width/4, 150);
      ctx.fillStyle = '#22c55e';
      ctx.fillText('AFTER', width * 3/4, 150);
      
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(width/4, 280, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(width/4 - 25, 260, 12, 0, Math.PI * 2);
      ctx.arc(width/4 + 25, 260, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(width/4, 310, 30, 0, Math.PI);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(width/4, 320, 30, 0.2, Math.PI - 0.2);
      ctx.stroke();
      
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(width * 3/4, 280, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(width * 3/4 - 25, 260, 12, 0, Math.PI * 2);
      ctx.arc(width * 3/4 + 25, 260, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(width * 3/4, 300, 30, Math.PI, 0);
      ctx.stroke();
      
      ctx.fillStyle = '#64748b';
      ctx.font = '28px sans-serif';
      ctx.fillText('47 empty accounts', width/4, 420);
      ctx.fillText('0.02 SOL locked', width/4, 460);
      
      ctx.fillStyle = '#22c55e';
      ctx.fillText('0 empty accounts', width * 3/4, 420);
      ctx.fillText('+0.47 SOL', width * 3/4, 460);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 40);
      
    } else if (template === 1) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#f97316';
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * width;
        const y = height - Math.random() * height;
        const flameH = 30 + Math.random() * 100;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 15, y - flameH/2, x, y - flameH);
        ctx.quadraticCurveTo(x + 15, y - flameH/2, x, y);
        ctx.fill();
      }
      ctx.fillStyle = '#fbbf24';
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * width;
        const y = height - Math.random() * (height * 0.6);
        const flameH = 20 + Math.random() * 60;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 10, y - flameH/2, x, y - flameH);
        ctx.quadraticCurveTo(x + 10, y - flameH/2, x, y);
        ctx.fill();
      }
      
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(width/2, height/2 - 30, 100, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(width/2 - 30, height/2 - 50, 15, 0, Math.PI * 2);
      ctx.arc(width/2 + 30, height/2 - 50, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(width/2, height/2, 40, Math.PI, 0);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#0a0a0a';
      ctx.stroke();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 60px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('THIS IS FINE', width/2, 80);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 40);
      
    } else if (template === 2) {
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('SMALL BRAIN:', 60, 100);
      ctx.fillText('MEDIUM BRAIN:', 60, 260);
      ctx.fillText('GALAXY BRAIN:', 60, 420);
      
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(width - 150, 80, 40, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.arc(width - 150, 240, 60, 0, Math.PI * 2);
      ctx.fill();
      
      const gradient = ctx.createRadialGradient(width - 150, 400, 0, width - 150, 400, 100);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.5, '#a78bfa');
      gradient.addColorStop(1, '#4c1d95');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(width - 150, 400, 80, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#94a3b8';
      ctx.font = '30px sans-serif';
      ctx.fillText('Ignoring empty accounts', 60, 150);
      ctx.fillStyle = '#c4b5fd';
      ctx.fillText('Manually closing one by one', 60, 310);
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('Using getfreesol.xyz', 60, 470);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('getfreesol.xyz', width/2, height - 40);
      
    } else if (template === 3) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 55px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POV:', width/2, 70);
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('You just discovered you have', width/2, 140);
      
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText('200+', width/2, 280);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 45px sans-serif';
      ctx.fillText('empty token accounts', width/2, 360);
      
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(width/2, 480, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(width/2 - 20, 460, 10, 0, Math.PI * 2);
      ctx.arc(width/2 + 20, 460, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('O', width/2, 510);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 35px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 30);
      
    } else {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.strokeRect(50, 50, width - 100, height - 100);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NOBODY:', width/2, 130);
      
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 45px sans-serif';
      ctx.fillText('SOLANA DEGENS AT 3AM:', width/2, 220);
      
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(width/2 - 200, 260, 400, 200, 20);
      ctx.fill();
      
      ctx.fillStyle = '#334155';
      ctx.font = '25px sans-serif';
      ctx.fillText('Burning 847 shitcoins', width/2, 320);
      ctx.fillText('Closing 156 empty accounts', width/2, 360);
      ctx.fillText('Reclaiming 2.3 SOL', width/2, 400);
      
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 35px sans-serif';
      ctx.fillText('Worth it', width/2, 440);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 40);
    }
    
  } else if (type === 'trending') {
    if (template === 0) {
      // Purple/gold gradient celebrating trending status
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#4c1d95');
      gradient.addColorStop(0.5, '#7c3aed');
      gradient.addColorStop(1, '#fbbf24');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawParticles(ctx, width, height, 'rgba(255,255,255,0.3)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 75, 30, 150, 150);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('#2', width/2, 280);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('ON PHANTOM', width/2, 360);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '40px sans-serif';
      ctx.fillText('Thank you Solana community!', width/2, 450);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 60);
      
    } else if (template === 1) {
      // Trophy/achievement style
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      
      // Gold border
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 8;
      ctx.strokeRect(30, 30, width - 60, height - 60);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('TRENDING ON PHANTOM', width/2, 120);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 180px sans-serif';
      ctx.fillText('#2', width/2, 330);
      
      ctx.fillStyle = '#a78bfa';
      ctx.font = '45px sans-serif';
      ctx.fillText('Reclaim your hidden SOL today', width/2, 420);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 60);
      
    } else if (template === 2) {
      // Silver medal celebration style
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#1e1b4b');
      gradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Silver accents
      drawParticles(ctx, width, height, 'rgba(192,192,192,0.3)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 75, 40, 150, 150);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c0c0c0';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('SILVER ON PHANTOM', width/2, 280);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 140px sans-serif';
      ctx.fillText('#2', width/2, 420);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '40px sans-serif';
      ctx.fillText('Thank you Solana community!', width/2, 510);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 45px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 50);
      
    } else if (template === 3) {
      // Celebration style with confetti-like elements
      ctx.fillStyle = '#4c1d95';
      ctx.fillRect(0, 0, width, height);
      
      // Draw colorful celebration dots
      const colors = ['#fbbf24', '#22c55e', '#f97316', '#ec4899', '#3b82f6'];
      for (let i = 0; i < 100; i++) {
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.beginPath();
        ctx.arc(Math.random() * width, Math.random() * height, 3 + Math.random() * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 60, 40, 120, 120);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 70px sans-serif';
      ctx.fillText('WE DID IT!', width/2, 250);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('#2 ON PHANTOM', width/2, 370);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '40px sans-serif';
      ctx.fillText('Thank you for believing in us', width/2, 460);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 50);
      
    } else {
      // Simple elegant style
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#7c3aed');
      gradient.addColorStop(1, '#4c1d95');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawWaveLines(ctx, width, height, 'rgba(255,255,255,0.1)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('TRENDING #2', width/2, 200);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('on Phantom Wallet', width/2, 290);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '40px sans-serif';
      ctx.fillText('Solana Tools Category', width/2, 380);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 80);
    }
    
  } else if (type === 'trending1') {
    // GOLD METAL #1 TRENDING TEMPLATES - Metallic gold style
    if (template === 0) {
      // Brushed gold metal background
      const metalGradient = ctx.createLinearGradient(0, 0, 0, height);
      metalGradient.addColorStop(0, '#d4a84b');
      metalGradient.addColorStop(0.15, '#f5e6a3');
      metalGradient.addColorStop(0.3, '#c9a227');
      metalGradient.addColorStop(0.5, '#f5e6a3');
      metalGradient.addColorStop(0.7, '#8b6914');
      metalGradient.addColorStop(0.85, '#f5e6a3');
      metalGradient.addColorStop(1, '#c9a227');
      ctx.fillStyle = metalGradient;
      ctx.fillRect(0, 0, width, height);
      
      // Brushed metal horizontal lines
      for (let y = 0; y < height; y += 3) {
        ctx.strokeStyle = `rgba(139, 105, 20, ${0.05 + Math.random() * 0.1})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 70, 25, 140, 140);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#3d2a0a';
      ctx.font = 'bold 130px sans-serif';
      ctx.fillText('#1', width/2, 300);
      
      ctx.fillStyle = '#5c3d10';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('ON PHANTOM', width/2, 380);
      
      ctx.fillStyle = '#3d2a0a';
      ctx.font = '40px sans-serif';
      ctx.fillText('Thank you Solana community!', width/2, 450);
      
      ctx.fillStyle = '#1a1207';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 55);
      
    } else if (template === 1) {
      // Black with gold metal plate
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      // Gold metal plate in center
      const plateY = 100;
      const plateHeight = 380;
      const plateGradient = ctx.createLinearGradient(60, plateY, 60, plateY + plateHeight);
      plateGradient.addColorStop(0, '#c9a227');
      plateGradient.addColorStop(0.2, '#f5e6a3');
      plateGradient.addColorStop(0.4, '#d4a84b');
      plateGradient.addColorStop(0.6, '#f5e6a3');
      plateGradient.addColorStop(0.8, '#8b6914');
      plateGradient.addColorStop(1, '#c9a227');
      ctx.fillStyle = plateGradient;
      ctx.fillRect(60, plateY, width - 120, plateHeight);
      
      // Plate border emboss
      ctx.strokeStyle = '#5c3d10';
      ctx.lineWidth = 4;
      ctx.strokeRect(60, plateY, width - 120, plateHeight);
      ctx.strokeStyle = '#f5e6a3';
      ctx.lineWidth = 2;
      ctx.strokeRect(65, plateY + 5, width - 130, plateHeight - 10);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 50, plateY + 20, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#3d2a0a';
      ctx.font = 'bold 140px sans-serif';
      ctx.fillText('#1', width/2, plateY + 260);
      
      ctx.fillStyle = '#5c3d10';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('PHANTOM WALLET', width/2, plateY + 330);
      
      ctx.fillStyle = '#c9a227';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 45);
      
    } else if (template === 2) {
      // Gold metal with shine effect
      const shineGradient = ctx.createRadialGradient(width * 0.3, height * 0.3, 0, width * 0.5, height * 0.5, width);
      shineGradient.addColorStop(0, '#fff8dc');
      shineGradient.addColorStop(0.2, '#f5e6a3');
      shineGradient.addColorStop(0.5, '#c9a227');
      shineGradient.addColorStop(0.8, '#8b6914');
      shineGradient.addColorStop(1, '#5c3d10');
      ctx.fillStyle = shineGradient;
      ctx.fillRect(0, 0, width, height);
      
      // Metallic highlights
      for (let i = 0; i < 8; i++) {
        const hlGradient = ctx.createLinearGradient(0, i * 70, width, i * 70 + 30);
        hlGradient.addColorStop(0, 'rgba(255, 248, 220, 0)');
        hlGradient.addColorStop(0.5, 'rgba(255, 248, 220, 0.3)');
        hlGradient.addColorStop(1, 'rgba(255, 248, 220, 0)');
        ctx.fillStyle = hlGradient;
        ctx.fillRect(0, i * 70, width, 15);
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 65, 30, 130, 130);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#3d2a0a';
      ctx.font = 'bold 70px sans-serif';
      ctx.fillText('WE ARE', width/2, 240);
      
      ctx.fillStyle = '#1a1207';
      ctx.font = 'bold 150px sans-serif';
      ctx.fillText('#1', width/2, 390);
      
      ctx.fillStyle = '#3d2a0a';
      ctx.font = 'bold 45px sans-serif';
      ctx.fillText('on Phantom Wallet', width/2, 460);
      
      ctx.fillStyle = '#1a1207';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 55);
      
    } else if (template === 3) {
      // Dark premium with gold metal text effect
      ctx.fillStyle = '#1a1207';
      ctx.fillRect(0, 0, width, height);
      
      // Subtle gold dust particles
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = 1 + Math.random() * 3;
        const alpha = 0.3 + Math.random() * 0.5;
        ctx.fillStyle = `rgba(201, 162, 39, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Gold metal border
      const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
      borderGradient.addColorStop(0, '#8b6914');
      borderGradient.addColorStop(0.3, '#f5e6a3');
      borderGradient.addColorStop(0.5, '#c9a227');
      borderGradient.addColorStop(0.7, '#f5e6a3');
      borderGradient.addColorStop(1, '#8b6914');
      ctx.strokeStyle = borderGradient;
      ctx.lineWidth = 8;
      ctx.strokeRect(25, 25, width - 50, height - 50);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 55, 50, 110, 110);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c9a227';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('GET FREE SOL', width/2, 240);
      
      ctx.fillStyle = '#f5e6a3';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText('#1', width/2, 380);
      
      ctx.fillStyle = '#c9a227';
      ctx.font = '40px sans-serif';
      ctx.fillText('Thank you for your support!', width/2, 455);
      
      ctx.fillStyle = '#f5e6a3';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 50);
      
    } else {
      // Polished gold medal style
      const medalGradient = ctx.createLinearGradient(0, 0, width, height);
      medalGradient.addColorStop(0, '#8b6914');
      medalGradient.addColorStop(0.25, '#f5e6a3');
      medalGradient.addColorStop(0.5, '#c9a227');
      medalGradient.addColorStop(0.75, '#f5e6a3');
      medalGradient.addColorStop(1, '#8b6914');
      ctx.fillStyle = medalGradient;
      ctx.fillRect(0, 0, width, height);
      
      // Circular shine overlay
      const circleGradient = ctx.createRadialGradient(width * 0.7, height * 0.2, 0, width * 0.5, height * 0.5, width);
      circleGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      circleGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.1)');
      circleGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = circleGradient;
      ctx.fillRect(0, 0, width, height);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1a1207';
      ctx.font = 'bold 160px sans-serif';
      ctx.fillText('#1', width/2, 280);
      
      ctx.fillStyle = '#3d2a0a';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('ON PHANTOM', width/2, 380);
      
      ctx.fillStyle = '#3d2a0a';
      ctx.font = '40px sans-serif';
      ctx.fillText('Thank you Solana community!', width/2, 450);
      
      ctx.fillStyle = '#1a1207';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width/2, height - 55);
    }
    
  } else if (type === 'christmas') {
    // Christmas themed banner - 10 unique designs
    if (template === 0) {
      // Red and green Christmas gradient
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#165B33');
      gradient.addColorStop(0.5, '#0A3622');
      gradient.addColorStop(1, '#BB2528');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = Math.random() * 6 + 2;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.fillStyle = '#FFD700';
      for (let i = 0; i < 15; i++) {
        const x = Math.random() * width;
        const y = Math.random() * (height * 0.4);
        const size = Math.random() * 4 + 2;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('MERRY', width / 2, 200);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 110px sans-serif';
      ctx.fillText('CHRISTMAS!', width / 2, 320);
      ctx.fillStyle = '#FFD700';
      ctx.font = '45px sans-serif';
      ctx.fillText('Unwrap your hidden SOL today!', width / 2, 420);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 550);
      
    } else if (template === 1) {
      // Winter wonderland style
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#1e3a5f');
      gradient.addColorStop(0.5, '#2d5a87');
      gradient.addColorStop(1, '#4a7c9b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 80; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = Math.random() * 5 + 1;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, height - 80);
      ctx.bezierCurveTo(width * 0.25, height - 120, width * 0.5, height - 60, width * 0.75, height - 100);
      ctx.bezierCurveTo(width * 0.9, height - 80, width, height - 90, width, height);
      ctx.closePath();
      ctx.fill();
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 40, 90, 90);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FF6B6B';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('HAPPY HOLIDAYS!', width / 2, 200);
      ctx.fillStyle = '#ffffff';
      ctx.font = '50px sans-serif';
      ctx.fillText("Santa's gift: Free SOL from empty accounts!", width / 2, 310);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 70px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 440);
      
    } else if (template === 2) {
      // Festive red with ornaments
      ctx.fillStyle = '#8B0000';
      ctx.fillRect(0, 0, width, height);
      
      // Gold ornament circles
      const ornamentColors = ['#FFD700', '#FFA500', '#FF6347'];
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = Math.random() * 40 + 20;
        ctx.fillStyle = ornamentColors[i % 3];
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      
      // Snowflakes
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 4 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 85px sans-serif';
      ctx.fillText("SANTA'S HERE!", width / 2, 220);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '48px sans-serif';
      ctx.fillText('Reclaim your hidden SOL gifts!', width / 2, 320);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 520);
      
    } else if (template === 3) {
      // Candy cane stripes
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      
      // Red stripes
      ctx.fillStyle = '#DC143C';
      const stripeWidth = 60;
      for (let i = -height; i < width + height; i += stripeWidth * 2) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + stripeWidth, 0);
        ctx.lineTo(i + stripeWidth + height, height);
        ctx.lineTo(i + height, height);
        ctx.closePath();
        ctx.fill();
      }
      
      // Snowflakes on top
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 5 + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#165B33';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('MERRY XMAS!', width / 2, 220);
      ctx.fillStyle = '#DC143C';
      ctx.font = '50px sans-serif';
      ctx.fillText('Your SOL is waiting under the tree!', width / 2, 330);
      ctx.fillStyle = '#165B33';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 520);
      
    } else if (template === 4) {
      // Northern lights / Aurora style
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0a1628');
      gradient.addColorStop(0.3, '#1a3a52');
      gradient.addColorStop(0.5, '#2d6b5a');
      gradient.addColorStop(0.7, '#1a5a4a');
      gradient.addColorStop(1, '#0d2d24');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Stars
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * width;
        const y = Math.random() * (height * 0.6);
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 2 + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Snow at bottom
      ctx.fillStyle = '#e8f4f8';
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, height - 60);
      ctx.bezierCurveTo(width * 0.3, height - 90, width * 0.7, height - 40, width, height - 70);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7DF9FF';
      ctx.font = 'bold 80px sans-serif';
      ctx.fillText('WINTER MAGIC!', width / 2, 200);
      ctx.fillStyle = '#ffffff';
      ctx.font = '45px sans-serif';
      ctx.fillText('Discover hidden SOL in your wallet', width / 2, 300);
      ctx.fillStyle = '#7DF9FF';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 450);
      
    } else if (template === 5) {
      // Cozy Christmas - warm colors
      const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width);
      gradient.addColorStop(0, '#8B4513');
      gradient.addColorStop(0.5, '#5D3A1A');
      gradient.addColorStop(1, '#2F1810');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Warm glow orbs
      const glowColors = ['rgba(255, 200, 100, 0.3)', 'rgba(255, 150, 50, 0.2)', 'rgba(255, 220, 150, 0.25)'];
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const radius = Math.random() * 150 + 80;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grd.addColorStop(0, glowColors[i % 3]);
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, width, height);
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 85px sans-serif';
      ctx.fillText('COZY CHRISTMAS', width / 2, 200);
      ctx.fillStyle = '#FFF8DC';
      ctx.font = '45px sans-serif';
      ctx.fillText('Warm up with some free SOL!', width / 2, 310);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 500);
      
    } else if (template === 6) {
      // Elegant gold and navy
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, width, height);
      
      // Gold decorative elements
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 40, width - 80, height - 80);
      ctx.strokeRect(60, 60, width - 120, height - 120);
      
      // Corner ornaments
      ctx.fillStyle = '#FFD700';
      [50, width - 50].forEach(x => {
        [50, height - 50].forEach(y => {
          ctx.beginPath();
          ctx.arc(x, y, 15, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      
      // Snowflakes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      for (let i = 0; i < 40; i++) {
        const x = 100 + Math.random() * (width - 200);
        const y = 100 + Math.random() * (height - 200);
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 3 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 50, 100, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 75px sans-serif';
      ctx.fillText('SEASONS GREETINGS', width / 2, 280);
      ctx.fillStyle = '#ffffff';
      ctx.font = '42px sans-serif';
      ctx.fillText('Claim your holiday SOL bonus!', width / 2, 370);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 520);
      
    } else if (template === 7) {
      // Snowy forest
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#87CEEB');
      gradient.addColorStop(0.4, '#B0E0E6');
      gradient.addColorStop(1, '#F0F8FF');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Simple trees
      ctx.fillStyle = '#228B22';
      for (let i = 0; i < 8; i++) {
        const x = 100 + i * 140;
        const y = height - 100;
        const treeHeight = 150 + Math.random() * 100;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 40, y);
        ctx.lineTo(x, y - treeHeight);
        ctx.lineTo(x + 40, y);
        ctx.closePath();
        ctx.fill();
      }
      
      // Snow ground
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, height - 100, width, 100);
      
      // Snowflakes
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * width;
        const y = Math.random() * (height - 100);
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 4 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#DC143C';
      ctx.font = 'bold 80px sans-serif';
      ctx.fillText('LET IT SNOW!', width / 2, 200);
      ctx.fillStyle = '#165B33';
      ctx.font = '45px sans-serif';
      ctx.fillText('Your SOL is ready to be unwrapped!', width / 2, 300);
      ctx.fillStyle = '#DC143C';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 450);
      
    } else if (template === 8) {
      // Gift wrap pattern
      ctx.fillStyle = '#DC143C';
      ctx.fillRect(0, 0, width, height);
      
      // Gold ribbon
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(width/2 - 30, 0, 60, height);
      ctx.fillRect(0, height/2 - 30, width, 60);
      
      // Bow center
      ctx.beginPath();
      ctx.arc(width/2, height/2, 50, 0, Math.PI * 2);
      ctx.fill();
      
      // Snowflakes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 4 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 80, 80);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 70px sans-serif';
      ctx.fillText('UNWRAP YOUR', width / 2, 180);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('FREE SOL!', width / 2, 480);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 45px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 580);
      
    } else {
      // Classic Christmas green with holly
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#165B33');
      gradient.addColorStop(1, '#0D3D22');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Holly berries
      ctx.fillStyle = '#DC143C';
      for (let i = 0; i < 25; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 10 + 5, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Snowflakes
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 4 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric__G__in_Gradient_Colours_1765500475287.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('HO HO HO!', width / 2, 200);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '50px sans-serif';
      ctx.fillText('Santa brought you free SOL!', width / 2, 310);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 520);
    }
    
  } else {
    if (template === 0) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#4c1d95');
      gradient.addColorStop(1, '#7c3aed');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawDiagonalLines(ctx, width, height, 'rgba(255,255,255,0.08)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('RECLAIM YOUR SOL', width / 2, 240);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '42px sans-serif';
      ctx.fillText('Empty token accounts = Hidden SOL', width / 2, 330);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 80px sans-serif';
      ctx.fillText('~0.002 SOL', width / 2, 450);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 560);
      
    } else if (template === 1) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, 0, width * 0.4, height);
      drawDotGrid(ctx, width, height, 'rgba(255,255,255,0.1)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, height - 150, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 70px sans-serif';
      ctx.fillText('FREE', 60, 200);
      ctx.fillText('SOL', 60, 280);
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 65px sans-serif';
      ctx.fillText('RECLAIM', width * 0.45, 200);
      ctx.fillText('YOUR', width * 0.45, 280);
      ctx.fillText('HIDDEN', width * 0.45, 360);
      ctx.fillText('SOL', width * 0.45, 440);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', width * 0.45, 560);
      
    } else if (template === 2) {
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, width, height);
      drawGlowOrbs(ctx, width, height, ['rgba(139,92,246,0.3)', 'rgba(52,211,153,0.2)', 'rgba(251,191,36,0.2)', 'rgba(124,58,237,0.2)']);
      
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 3;
      ctx.strokeRect(60, 60, width - 120, height - 120);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 60, 100, 120, 120);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 75px sans-serif';
      ctx.fillText('GET FREE SOL', width / 2, 320);
      
      ctx.fillStyle = '#34d399';
      ctx.font = '50px sans-serif';
      ctx.fillText('~0.002 SOL per empty account', width / 2, 420);
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 540);
      
    } else if (template === 3) {
      ctx.fillStyle = '#059669';
      ctx.fillRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#34d399');
      gradient.addColorStop(1, '#059669');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawWaveLines(ctx, width, height, 'rgba(255,255,255,0.1)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width - 150, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('HIDDEN', 80, 220);
      ctx.fillStyle = '#1e1b4b';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('SOL?', 80, 330);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '45px sans-serif';
      ctx.fillText('Reclaim rent from empty token accounts', 80, 430);
      
      ctx.fillStyle = '#1e1b4b';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', 80, 540);
      
    } else {
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, width, height);
      drawTriangles(ctx, width, height, 'rgba(139,92,246,0.15)');
      
      ctx.fillStyle = '#7c3aed';
      ctx.beginPath();
      ctx.moveTo(width, 0);
      ctx.lineTo(width, height);
      ctx.lineTo(width * 0.5, height);
      ctx.closePath();
      ctx.fill();
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 50, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 85px sans-serif';
      ctx.fillText('RECLAIM', 80, 250);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 85px sans-serif';
      ctx.fillText('YOUR SOL', 80, 350);
      
      ctx.fillStyle = '#e0e7ff';
      ctx.font = '40px sans-serif';
      ctx.fillText('~0.002 SOL per empty account', 80, 450);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('getfreesol.xyz', 80, 550);
    }
  }

  return canvas.toBuffer('image/png');
}

// Daily Report Banner Generator
export interface DailyReportOptions {
  totalSolClaimed: string;
  totalAccountsClosed: number;
  periodLabel?: string;
  style?: 1 | 2 | 3 | 4 | 5;
}

export async function generateDailyReportBanner(options: DailyReportOptions): Promise<Buffer> {
  const { totalSolClaimed, totalAccountsClosed, periodLabel = 'Since Launch', style = 1 } = options;
  
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  const solValue = parseFloat(totalSolClaimed).toFixed(2);
  const accountsFormatted = totalAccountsClosed >= 1000 
    ? `${(totalAccountsClosed / 1000).toFixed(1)}k` 
    : totalAccountsClosed.toString();

  const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');

  if (style === 1) {
    // STYLE 1: Classic Purple with Stats Box
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1e1b4b');
    gradient.addColorStop(0.5, '#312e81');
    gradient.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    drawGlowOrbs(ctx, width, height, ['rgba(52,211,153,0.2)', 'rgba(167,139,250,0.15)', 'rgba(251,191,36,0.1)']);
    ctx.strokeStyle = 'rgba(167,139,250,0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, width - 60, height - 60);
    try { const logo = await loadImage(logoPath); ctx.drawImage(logo, 50, 50, 80, 80); } catch (e) {}
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('GetFreeSol', 145, 105);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText(`Daily Report (${periodLabel})`, width / 2, 190);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, 80, 230, width - 160, 280, 20);
    ctx.fill();
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 90px sans-serif';
    ctx.fillText(`${solValue} SOL`, width / 2, 340);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '32px sans-serif';
    ctx.fillText('Total SOL Claimed', width / 2, 390);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 70px sans-serif';
    ctx.fillText(accountsFormatted, width / 2, 475);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '32px sans-serif';
    ctx.fillText('Accounts Closed', width / 2, 520);
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText('Claim yours at getfreesol.xyz', width / 2, 590);

  } else if (style === 2) {
    // STYLE 2: Gradient Green Split Design
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#064e3b');
    gradient.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    drawDotGrid(ctx, width, height, 'rgba(52,211,153,0.1)');
    try { const logo = await loadImage(logoPath); ctx.drawImage(logo, width - 130, 50, 80, 80); } catch (e) {}
    ctx.textAlign = 'left';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 70px sans-serif';
    ctx.fillText('DAILY REPORT', 80, 150);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '35px sans-serif';
    ctx.fillText(`${periodLabel}`, 80, 200);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 140px sans-serif';
    ctx.fillText(`${solValue}`, 80, 360);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText('SOL', 80, 430);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 80px sans-serif';
    ctx.fillText(accountsFormatted, 80, 530);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '35px sans-serif';
    ctx.fillText('accounts closed', 80, 580);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('getfreesol.xyz', width - 80, height - 60);

  } else if (style === 3) {
    // STYLE 3: Purple Gradient (matches website claim alert card)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#7c3aed');
    gradient.addColorStop(0.5, '#8b5cf6');
    gradient.addColorStop(1, '#6d28d9');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    try { const logo = await loadImage(logoPath); ctx.drawImage(logo, width - 180, height - 150, 130, 130); } catch (e) {}
    ctx.textAlign = 'center';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 55px sans-serif';
    ctx.fillText('CLAIMED', width / 2, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 140px sans-serif';
    ctx.fillText(`+ ${solValue} SOL`, width / 2, 280);
    ctx.fillStyle = '#e0e7ff';
    ctx.font = '40px sans-serif';
    ctx.fillText(`${accountsFormatted} accounts closed`, width / 2, 370);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText('GET FREE SOL', width - 60, height - 60);

  } else if (style === 4) {
    // STYLE 4: Two Column Card Layout (Purple background like website)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#7c3aed');
    gradient.addColorStop(0.5, '#6d28d9');
    gradient.addColorStop(1, '#5b21b6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    drawTriangles(ctx, width, height, 'rgba(255,255,255,0.05)');
    try { const logo = await loadImage(logoPath); ctx.drawImage(logo, width/2 - 45, 30, 90, 90); } catch (e) {}
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText('GetFreeSol', width / 2, 165);
    ctx.fillStyle = '#e0e7ff';
    ctx.font = '32px sans-serif';
    ctx.fillText(`Daily Report • ${periodLabel}`, width / 2, 210);
    // Left card - SOL (matches website: bg-gradient-to-br from-purple-800/20 to-purple-900/30)
    const leftGrad = ctx.createLinearGradient(60, 240, 580, 530);
    leftGrad.addColorStop(0, 'rgba(107, 33, 168, 0.25)');
    leftGrad.addColorStop(1, 'rgba(88, 28, 135, 0.35)');
    ctx.fillStyle = leftGrad;
    roundRect(ctx, 60, 240, 520, 300, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
    ctx.lineWidth = 2;
    roundRect(ctx, 60, 240, 520, 300, 20);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 120px sans-serif';
    ctx.fillText(solValue, 320, 400);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 45px sans-serif';
    ctx.fillText('SOL CLAIMED', 320, 475);
    // Right card - Accounts (matches website: bg-gradient-to-br from-purple-800/20 to-purple-900/30)
    const rightGrad = ctx.createLinearGradient(620, 240, 1140, 530);
    rightGrad.addColorStop(0, 'rgba(107, 33, 168, 0.25)');
    rightGrad.addColorStop(1, 'rgba(88, 28, 135, 0.35)');
    ctx.fillStyle = rightGrad;
    roundRect(ctx, 620, 240, 520, 300, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
    ctx.lineWidth = 2;
    roundRect(ctx, 620, 240, 520, 300, 20);
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 120px sans-serif';
    ctx.fillText(accountsFormatted, 880, 400);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 45px sans-serif';
    ctx.fillText('ACCOUNTS', 880, 475);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 35px sans-serif';
    ctx.fillText('Claim yours at getfreesol.xyz', width / 2, 585);

  } else if (style === 5) {
    // STYLE 5: Bold Minimal with Gradient Text Effect
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);
    drawWaveLines(ctx, width, height, 'rgba(139,92,246,0.15)');
    try { const logo = await loadImage(logoPath); ctx.drawImage(logo, 50, height - 120, 70, 70); } catch (e) {}
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '30px sans-serif';
    ctx.fillText(`DAILY REPORT • ${periodLabel.toUpperCase()}`, 80, 80);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 180px sans-serif';
    ctx.fillText(solValue, 80, 280);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 70px sans-serif';
    ctx.fillText('SOL CLAIMED', 80, 370);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 120px sans-serif';
    ctx.fillText(accountsFormatted, 80, 510);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText('ACCOUNTS CLOSED', 80, 580);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 35px sans-serif';
    ctx.fillText('getfreesol.xyz', 140, height - 75);
  }

  return canvas.toBuffer('image/png');
}

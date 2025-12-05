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

const GM_STYLES = [
  { bg1: '#6b21a8', bg2: '#7c3aed', bg3: '#581c87', titleColor: '#fbbf24', subtitle: 'Rise and reclaim your hidden SOL' },
  { bg1: '#0ea5e9', bg2: '#0284c7', bg3: '#0369a1', titleColor: '#fde047', subtitle: 'Start your day with free SOL' },
  { bg1: '#059669', bg2: '#10b981', bg3: '#047857', titleColor: '#fcd34d', subtitle: 'Wake up to hidden SOL rewards' },
  { bg1: '#dc2626', bg2: '#ef4444', bg3: '#b91c1c', titleColor: '#fef08a', subtitle: 'Rise and shine, Solana fam' },
  { bg1: '#ea580c', bg2: '#f97316', bg3: '#c2410c', titleColor: '#ffffff', subtitle: 'A new day to reclaim SOL' },
];

const GN_STYLES = [
  { bg1: '#312e81', bg2: '#0f0a1e', moonColor: '#fef3c7', titleColor: '#c4b5fd', subtitle: 'Rest well, your SOL is safe' },
  { bg1: '#1e3a5f', bg2: '#0c1929', moonColor: '#e0f2fe', titleColor: '#93c5fd', subtitle: 'Sweet dreams, Solana fam' },
  { bg1: '#3b0764', bg2: '#1a0a2e', moonColor: '#fae8ff', titleColor: '#e879f9', subtitle: 'Goodnight, more SOL awaits tomorrow' },
  { bg1: '#1c1917', bg2: '#0a0908', moonColor: '#fcd34d', titleColor: '#a3a3a3', subtitle: 'Sleep tight, stack SOL tomorrow' },
];

const PROMO_STYLES = [
  { bg1: '#4c1d95', bg2: '#7c3aed', bg3: '#6d28d9', titleColor1: '#f97316', titleColor2: '#fbbf24', accent: '#34d399' },
  { bg1: '#0f172a', bg2: '#1e293b', bg3: '#334155', titleColor1: '#22d3ee', titleColor2: '#67e8f9', accent: '#a78bfa' },
  { bg1: '#14532d', bg2: '#166534', bg3: '#15803d', titleColor1: '#fbbf24', titleColor2: '#fde047', accent: '#4ade80' },
  { bg1: '#7f1d1d', bg2: '#991b1b', bg3: '#b91c1c', titleColor1: '#fef08a', titleColor2: '#fde047', accent: '#fca5a5' },
  { bg1: '#1e1b4b', bg2: '#312e81', bg3: '#3730a3', titleColor1: '#c4b5fd', titleColor2: '#e879f9', accent: '#67e8f9' },
];

export async function generatePostCardBanner(type: string = 'promo'): Promise<Buffer> {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  
  if (type === 'gm') {
    const style = GM_STYLES[Math.floor(Math.random() * GM_STYLES.length)];
    
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, style.bg1);
    bgGradient.addColorStop(0.5, style.bg2);
    bgGradient.addColorStop(1, style.bg3);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(width - 80, 80, 300, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = 100 + Math.random() * (width - 200);
      const y = 50 + Math.random() * 150;
      drawHexagon(ctx, x, y, 30 + Math.random() * 40);
    }
    
    try {
      const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, 50, 50, 100, 100);
    } catch (error) {
      console.error('Failed to load logo:', error);
    }
    
    ctx.fillStyle = style.titleColor;
    ctx.font = 'bold 100px sans-serif';
    ctx.fillText('GM SOLANA!', width / 2, 200);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '48px sans-serif';
    ctx.fillText(style.subtitle, width / 2, 300);
    
    ctx.font = 'bold 60px sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText('getfreesol.xyz', width / 2, 420);
    
    ctx.font = '36px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('Recover rent deposits from empty token accounts', width / 2, 500);
    
  } else if (type === 'gn') {
    const style = GN_STYLES[Math.floor(Math.random() * GN_STYLES.length)];
    
    ctx.fillStyle = style.bg2;
    ctx.fillRect(0, 0, width, height);
    
    const nightGradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, 500);
    nightGradient.addColorStop(0, style.bg1);
    nightGradient.addColorStop(1, style.bg2);
    ctx.fillStyle = nightGradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height * 0.7;
      const size = Math.random() * 3 + 0.5;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    const moonX = 100 + Math.random() * (width - 300);
    const moonY = 80 + Math.random() * 80;
    ctx.fillStyle = style.moonColor;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = style.bg2;
    ctx.beginPath();
    ctx.arc(moonX + 20, moonY - 10, 45, 0, Math.PI * 2);
    ctx.fill();
    
    try {
      const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, 50, 50, 100, 100);
    } catch (error) {
      console.error('Failed to load logo:', error);
    }
    
    ctx.fillStyle = style.titleColor;
    ctx.font = 'bold 110px sans-serif';
    ctx.fillText('GN SOLANA', width / 2, 280);
    
    ctx.fillStyle = '#e0e7ff';
    ctx.font = '44px sans-serif';
    ctx.fillText(style.subtitle, width / 2, 370);
    
    ctx.font = 'bold 56px sans-serif';
    ctx.fillStyle = '#a78bfa';
    ctx.fillText('getfreesol.xyz', width / 2, 480);
    
    ctx.font = '32px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('Tomorrow, reclaim your hidden SOL', width / 2, 560);
    
    return canvas.toBuffer('image/png');
    
  } else if (type === 'stats') {
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 70px sans-serif';
    ctx.fillText('PLATFORM STATS', width / 2, 180);
    
    ctx.font = 'bold 100px sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText('100+ SOL', width / 2, 320);
    
    ctx.font = '42px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Total SOL Recovered by Our Community', width / 2, 400);
    
    ctx.font = 'bold 50px sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('Join us: getfreesol.xyz', width / 2, 520);
    
  } else {
    const style = PROMO_STYLES[Math.floor(Math.random() * PROMO_STYLES.length)];
    
    ctx.fillStyle = '#0f0326';
    ctx.fillRect(0, 0, width, height);
    
    const promoGradient = ctx.createLinearGradient(0, 0, width, height);
    promoGradient.addColorStop(0, style.bg1);
    promoGradient.addColorStop(0.3, style.bg2);
    promoGradient.addColorStop(0.7, style.bg3);
    promoGradient.addColorStop(1, style.bg1);
    ctx.fillStyle = promoGradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height * 0.4;
      const size = 20 + Math.random() * 50;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.arc(width - 50 - Math.random() * 100, height - 50 - Math.random() * 100, 180 + Math.random() * 80, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.arc(50 + Math.random() * 100, height - 20 - Math.random() * 80, 120 + Math.random() * 60, 0, Math.PI * 2);
    ctx.fill();
    
    try {
      const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, 50, 50, 100, 100);
    } catch (error) {
      console.error('Failed to load logo:', error);
    }
    
    const titleGradient = ctx.createLinearGradient(200, 0, width - 200, 0);
    titleGradient.addColorStop(0, style.titleColor1);
    titleGradient.addColorStop(0.5, style.titleColor2);
    titleGradient.addColorStop(1, style.titleColor1);
    ctx.fillStyle = titleGradient;
    ctx.font = 'bold 85px sans-serif';
    ctx.fillText('RECLAIM YOUR SOL', width / 2, 230);
    
    ctx.fillStyle = '#e0e7ff';
    ctx.font = '42px sans-serif';
    ctx.fillText('Empty token accounts = Hidden SOL', width / 2, 320);
    
    ctx.fillStyle = style.accent;
    ctx.font = 'bold 75px sans-serif';
    ctx.fillText('~0.002 SOL', width / 2, 430);
    ctx.font = '36px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('per empty account', width / 2, 480);
    
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = style.titleColor2;
    ctx.fillText('getfreesol.xyz', width / 2, 570);
  }

  return canvas.toBuffer('image/png');
}

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

export async function generatePostCardBanner(type: string = 'promo'): Promise<Buffer> {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#6b21a8');
  bgGradient.addColorStop(0.5, '#7c3aed');
  bgGradient.addColorStop(1, '#581c87');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const x = 100 + (i * 150);
    const y = 100 + (i * 70);
    drawHexagon(ctx, x, y, 40 + Math.random() * 20);
  }

  try {
    const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
    const logo = await loadImage(logoPath);
    ctx.drawImage(logo, 50, 50, 100, 100);
  } catch (error) {
    console.error('Failed to load logo:', error);
  }

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  
  if (type === 'gm') {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 100px sans-serif';
    ctx.fillText('GM SOLANA!', width / 2, 200);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '48px sans-serif';
    ctx.fillText('Rise and reclaim your hidden SOL', width / 2, 300);
    
    ctx.font = 'bold 60px sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText('getfreesol.xyz', width / 2, 420);
    
    ctx.font = '36px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('Recover rent deposits from empty token accounts', width / 2, 500);
    
  } else if (type === 'gn') {
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, width, height);
    
    const nightGradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, 500);
    nightGradient.addColorStop(0, '#312e81');
    nightGradient.addColorStop(1, '#0f0a1e');
    ctx.fillStyle = nightGradient;
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height * 0.6;
      const size = Math.random() * 3 + 1;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(width - 150, 120, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.arc(width - 130, 110, 50, 0, Math.PI * 2);
    ctx.fill();
    
    try {
      const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, 50, 50, 100, 100);
    } catch (error) {
      console.error('Failed to load logo:', error);
    }
    
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 110px sans-serif';
    ctx.fillText('GN SOLANA', width / 2, 280);
    
    ctx.fillStyle = '#e0e7ff';
    ctx.font = '44px sans-serif';
    ctx.fillText('Rest well, your SOL is safe', width / 2, 370);
    
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
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 80px sans-serif';
    ctx.fillText('RECLAIM YOUR SOL', width / 2, 180);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '44px sans-serif';
    ctx.fillText('Empty token accounts = Hidden SOL', width / 2, 280);
    
    ctx.font = 'bold 70px sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText('~0.002 SOL per account', width / 2, 400);
    
    ctx.font = 'bold 50px sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('getfreesol.xyz', width / 2, 520);
  }

  return canvas.toBuffer('image/png');
}

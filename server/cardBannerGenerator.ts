import { createCanvas, registerFont } from 'canvas';
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
  bgGradient.addColorStop(0, '#1e1b4b');
  bgGradient.addColorStop(0.5, '#312e81');
  bgGradient.addColorStop(1, '#4c1d95');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 5; i++) {
    const circleGradient = ctx.createRadialGradient(
      Math.random() * width, 
      Math.random() * height, 
      0, 
      Math.random() * width, 
      Math.random() * height, 
      300
    );
    circleGradient.addColorStop(0, `rgba(168, 85, 247, ${0.1 + Math.random() * 0.2})`);
    circleGradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = circleGradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.strokeStyle = 'rgba(196, 181, 253, 0.2)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.arc(100 + i * 150, 150, 60 + i * 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  const headerGradient = ctx.createLinearGradient(100, 80, width - 100, 120);
  headerGradient.addColorStop(0, 'rgba(168, 85, 247, 0.3)');
  headerGradient.addColorStop(0.5, 'rgba(192, 132, 252, 0.4)');
  headerGradient.addColorStop(1, 'rgba(168, 85, 247, 0.3)');
  ctx.fillStyle = headerGradient;
  roundRect(ctx, 100, 80, width - 200, 60, 30);
  ctx.fill();

  ctx.fillStyle = '#e9d5ff';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✨ Successful Reclaim', width / 2, 125);

  const amountBg = ctx.createLinearGradient(width / 2 - 450, 240, width / 2 + 450, 320);
  amountBg.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
  amountBg.addColorStop(0.5, 'rgba(167, 139, 250, 0.5)');
  amountBg.addColorStop(1, 'rgba(139, 92, 246, 0.4)');
  ctx.fillStyle = amountBg;
  roundRect(ctx, width / 2 - 450, 240, 900, 100, 50);
  ctx.fill();

  ctx.strokeStyle = 'rgba(196, 181, 253, 0.6)';
  ctx.lineWidth = 3;
  roundRect(ctx, width / 2 - 450, 240, 900, 100, 50);
  ctx.stroke();

  const solText = `${parseFloat(solAmount).toFixed(4)} SOL`;
  ctx.font = 'bold 90px sans-serif';
  
  ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const solGradient = ctx.createLinearGradient(width / 2 - 300, 290, width / 2 + 300, 290);
  solGradient.addColorStop(0, '#fef3c7');
  solGradient.addColorStop(0.5, '#ffffff');
  solGradient.addColorStop(1, '#fef3c7');
  ctx.fillStyle = solGradient;
  ctx.textAlign = 'center';
  ctx.fillText(solText, width / 2, 305);

  ctx.shadowBlur = 0;

  const shortWallet = `${walletAddress.slice(0, 12)}...${walletAddress.slice(-12)}`;
  ctx.fillStyle = 'rgba(196, 181, 253, 0.4)';
  roundRect(ctx, width / 2 - 350, 380, 700, 50, 25);
  ctx.fill();

  ctx.fillStyle = '#d8b4fe';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(shortWallet, width / 2, 415);

  ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
  roundRect(ctx, width / 2 - 550, height - 100, 500, 60, 30);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🚀 GetFreeSol.xyz', width / 2 - 520, height - 55);

  ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
  roundRect(ctx, width / 2 + 80, height - 100, 470, 60, 30);
  ctx.fill();

  ctx.fillStyle = '#c4b5fd';
  ctx.font = '26px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Reclaim your SOL today! 💜', width / 2 + 110, height - 55);

  return canvas.toBuffer('image/png');
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

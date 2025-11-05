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

  ctx.fillStyle = '#5b21b6';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 100px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('CLAIMED', 80, 160);

  const solText = `+ ${parseFloat(solAmount).toFixed(4)} SOL`;
  ctx.font = 'bold 130px sans-serif';
  ctx.fillText(solText, 80, 310);

  ctx.font = '40px sans-serif';
  ctx.fillText('Claimer:', 80, 390);

  ctx.font = '34px sans-serif';
  ctx.fillText(walletAddress, 80, 450);

  drawGeometricGLogo(ctx, width - 280, height - 280);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('GET FREE SOL', width - 80, height - 80);

  return canvas.toBuffer('image/png');
}

function drawGeometricGLogo(ctx: any, x: number, y: number) {
  const size = 160;
  
  ctx.fillStyle = '#c4b5fd';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size * 0.7, y);
  ctx.lineTo(x + size * 0.7, y + size * 0.35);
  ctx.lineTo(x, y + size * 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#a78bfa';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.7, y);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size, y + size * 0.35);
  ctx.lineTo(x + size * 0.7, y + size * 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#8b5cf6';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.7, y + size * 0.35);
  ctx.lineTo(x + size, y + size * 0.35);
  ctx.lineTo(x + size, y + size * 0.65);
  ctx.lineTo(x + size * 0.7, y + size * 0.65);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.35);
  ctx.lineTo(x + size * 0.7, y + size * 0.35);
  ctx.lineTo(x + size * 0.7, y + size * 0.65);
  ctx.lineTo(x, y + size * 0.65);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#6d28d9';
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.65);
  ctx.lineTo(x + size * 0.35, y + size * 0.65);
  ctx.lineTo(x + size * 0.35, y + size);
  ctx.lineTo(x, y + size);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#5b21b6';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.35, y + size * 0.65);
  ctx.lineTo(x + size * 0.7, y + size * 0.65);
  ctx.lineTo(x + size * 0.7, y + size);
  ctx.lineTo(x + size * 0.35, y + size);
  ctx.closePath();
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

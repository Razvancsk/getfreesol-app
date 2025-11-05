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

  ctx.font = '30px sans-serif';
  ctx.fillText(walletAddress, 80, 450);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'right';
  const getFreeSolText = 'GET FREE SOL';
  const textMetrics = ctx.measureText(getFreeSolText);
  const textWidth = textMetrics.width;
  const textEndX = width - 80;
  const textStartX = textEndX - textWidth;
  const textCenterX = textStartX + (textWidth / 2);
  
  ctx.fillText(getFreeSolText, width - 80, height - 80);

  try {
    const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
    const logo = await loadImage(logoPath);
    const logoSize = 100;
    const logoX = textCenterX - (logoSize / 2);
    ctx.drawImage(logo, logoX, height - 210, logoSize, logoSize);
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

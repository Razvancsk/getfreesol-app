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

  const borderRadius = 30;
  ctx.fillStyle = '#000000';
  roundRect(ctx, 0, 0, width, height, borderRadius);
  ctx.fill();

  const cornerSize = 120;
  ctx.fillStyle = '#14F195';
  ctx.beginPath();
  ctx.moveTo(0, borderRadius);
  ctx.lineTo(0, 0);
  ctx.lineTo(borderRadius, 0);
  ctx.lineTo(cornerSize, 0);
  ctx.lineTo(0, cornerSize);
  ctx.lineTo(0, borderRadius);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(width, height - borderRadius);
  ctx.lineTo(width, height);
  ctx.lineTo(width - borderRadius, height);
  ctx.lineTo(width - cornerSize, height);
  ctx.lineTo(width, height - cornerSize);
  ctx.lineTo(width, height - borderRadius);
  ctx.closePath();
  ctx.fill();

  const hexagonSize = 8;
  const hexagonSpacing = 16;
  ctx.strokeStyle = '#14F19540';
  ctx.lineWidth = 1.5;
  
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 8; col++) {
      const x = 60 + col * hexagonSpacing * 1.5;
      const y = 100 + row * hexagonSpacing + (col % 2) * (hexagonSpacing / 2);
      
      drawHexagon(ctx, x, y, hexagonSize);
    }
  }

  ctx.fillStyle = '#14F195';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLAIMED', width / 2, 220);

  const solText = `${parseFloat(solAmount).toFixed(4)} SOL`;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 140px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(solText, width / 2, 370);

  ctx.fillStyle = '#999999';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  const shortWallet = `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}`;
  ctx.fillText(`Claimer: ${shortWallet}`, width / 2, 460);

  ctx.fillStyle = '#14F195';
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('GetFreeSol', width - 80, height - 60);

  ctx.strokeStyle = '#14F19560';
  ctx.lineWidth = 4;
  roundRect(ctx, 20, 20, width - 40, height - 40, borderRadius - 10);
  ctx.stroke();

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

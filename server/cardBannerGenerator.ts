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
  const height = 628;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  const cornerSize = 150;
  ctx.fillStyle = '#14F195';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(cornerSize, 0);
  ctx.lineTo(0, cornerSize);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(width, height);
  ctx.lineTo(width - cornerSize, height);
  ctx.lineTo(width, height - cornerSize);
  ctx.closePath();
  ctx.fill();

  const hexagonSize = 15;
  const hexagonSpacing = 20;
  ctx.strokeStyle = '#14F19530';
  ctx.lineWidth = 2;
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 80 + col * hexagonSpacing * 1.5;
      const y = 180 + row * hexagonSpacing + (col % 2) * (hexagonSpacing / 2);
      
      drawHexagon(ctx, x, y, hexagonSize);
    }
  }

  ctx.fillStyle = '#14F195';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLAIMED', width / 2, 180);

  const solText = `${parseFloat(solAmount).toFixed(4)} SOL`;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(solText, width / 2, 320);

  const gradient = ctx.createLinearGradient(0, 350, width, 350);
  gradient.addColorStop(0, '#9945FF');
  gradient.addColorStop(0.5, '#14F195');
  gradient.addColorStop(1, '#19D9E0');
  
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(200, 350);
  ctx.lineTo(width - 200, 350);
  ctx.stroke();

  ctx.fillStyle = '#888888';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  const shortWallet = `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}`;
  ctx.fillText(`Claimer: ${shortWallet}`, width / 2, 420);

  ctx.fillStyle = '#14F195';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('GetFreeSol', width - 60, height - 50);

  ctx.strokeStyle = '#14F19550';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  return canvas.toBuffer('image/png');
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

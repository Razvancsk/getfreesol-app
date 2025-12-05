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

  const template = Math.floor(Math.random() * 5);
  
  if (type === 'gm') {
    if (template === 0) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#fbbf24');
      gradient.addColorStop(1, '#f97316');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      drawDiagonalLines(ctx, width, height, 'rgba(255,255,255,0.1)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
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
      ctx.fillText('Rise and reclaim your hidden SOL', 80, 400);
      
      ctx.font = 'bold 50px sans-serif';
      ctx.fillStyle = '#1e1b4b';
      ctx.fillText('getfreesol.xyz', 80, 520);
      
    } else if (template === 1) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      drawGlowOrbs(ctx, width, height, ['rgba(251,191,36,0.3)', 'rgba(249,115,22,0.2)', 'rgba(234,88,12,0.2)', 'rgba(220,38,38,0.15)']);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
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
      ctx.fillText('Another day to reclaim your hidden SOL', width / 2, 440);
      
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 550);
      
    } else if (template === 2) {
      ctx.fillStyle = '#6b21a8';
      ctx.fillRect(0, 0, width / 2, height);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(width / 2, 0, width / 2, height);
      drawDotGrid(ctx, width, height, 'rgba(255,255,255,0.1)');
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, height - 150, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('GM', width / 4, 280);
      
      ctx.fillStyle = '#1e1b4b';
      ctx.font = 'bold 100px sans-serif';
      ctx.fillText('SOLANA', width * 3/4, 280);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '40px sans-serif';
      ctx.fillText('Reclaim hidden SOL', width / 4, 400);
      
      ctx.fillStyle = '#1e1b4b';
      ctx.font = '40px sans-serif';
      ctx.fillText('getfreesol.xyz', width * 3/4, 400);
      
    } else if (template === 3) {
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
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
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
      ctx.fillText('Start your day by reclaiming hidden SOL', width / 2, 570);
      
    } else {
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, width, height);
      drawTriangles(ctx, width, height, 'rgba(139,92,246,0.2)');
      
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 40, width - 80, height - 80);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 50, 80, 100, 100);
      } catch (e) {}
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 110px sans-serif';
      ctx.fillText('GM SOLANA', width / 2, 300);
      
      ctx.fillStyle = '#a78bfa';
      ctx.font = '42px sans-serif';
      ctx.fillText('Rise, shine, and reclaim your SOL', width / 2, 400);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText('getfreesol.xyz', width / 2, 520);
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
    const neonGreen = '#39ff14';
    const neonPurple = '#bf00ff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const drawPerson = (x: number, y: number, scale: number, color: string, armUp = false, hasCrown = false) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - 60 * scale, 25 * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - 35 * scale);
      ctx.lineTo(x, y + 40 * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + 40 * scale);
      ctx.lineTo(x - 25 * scale, y + 100 * scale);
      ctx.moveTo(x, y + 40 * scale);
      ctx.lineTo(x + 25 * scale, y + 100 * scale);
      ctx.stroke();
      ctx.beginPath();
      if (armUp) {
        ctx.moveTo(x, y - 10 * scale);
        ctx.lineTo(x - 35 * scale, y - 50 * scale);
        ctx.moveTo(x, y - 10 * scale);
        ctx.lineTo(x + 35 * scale, y + 20 * scale);
      } else {
        ctx.moveTo(x, y - 10 * scale);
        ctx.lineTo(x - 35 * scale, y + 20 * scale);
        ctx.moveTo(x, y - 10 * scale);
        ctx.lineTo(x + 35 * scale, y + 20 * scale);
      }
      ctx.stroke();
      if (hasCrown) {
        ctx.beginPath();
        ctx.moveTo(x - 20 * scale, y - 85 * scale);
        ctx.lineTo(x - 15 * scale, y - 100 * scale);
        ctx.lineTo(x - 5 * scale, y - 85 * scale);
        ctx.lineTo(x, y - 105 * scale);
        ctx.lineTo(x + 5 * scale, y - 85 * scale);
        ctx.lineTo(x + 15 * scale, y - 100 * scale);
        ctx.lineTo(x + 20 * scale, y - 85 * scale);
        ctx.stroke();
      }
    };
    
    if (template === 0) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width - 180, 30, 150, 50);
      } catch (e) {}
      
      ctx.fillStyle = neonGreen;
      ctx.font = 'bold 35px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('GETFREESOL', width - 175, 60);
      
      drawPerson(120, 280, 1.2, neonGreen, false, true);
      
      drawPerson(350, 350, 1, neonGreen);
      drawPerson(450, 320, 1, neonGreen);
      drawPerson(550, 380, 0.9, neonGreen);
      drawPerson(650, 340, 1, neonGreen);
      drawPerson(750, 360, 0.95, neonGreen);
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(300, 500);
      ctx.lineTo(800, 500);
      ctx.lineTo(850, 550);
      ctx.lineTo(250, 550);
      ctx.closePath();
      ctx.stroke();
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(50, 150, 150, 80);
      ctx.stroke();
      ctx.fillStyle = neonGreen;
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('They dont know', 125, 185);
      ctx.fillText('I reclaimed 2 SOL', 125, 210);
      
    } else if (template === 1) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 30, 80, 80);
      } catch (e) {}
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(width/2, 320, 100, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(width/2 - 30, 290, 8, 0, Math.PI * 2);
      ctx.arc(width/2 + 30, 290, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(width/2 - 40, 360);
      ctx.quadraticCurveTo(width/2, 320, width/2 + 40, 360);
      ctx.stroke();
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i;
        const x1 = width/2 + Math.cos(angle) * 120;
        const y1 = 320 + Math.sin(angle) * 120;
        const x2 = width/2 + Math.cos(angle) * 160;
        const y2 = 320 + Math.sin(angle) * 160;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(width/2, 420);
      ctx.lineTo(width/2, 520);
      ctx.moveTo(width/2, 460);
      ctx.lineTo(width/2 - 50, 500);
      ctx.moveTo(width/2, 460);
      ctx.lineTo(width/2 + 50, 500);
      ctx.stroke();
      
      ctx.fillStyle = neonGreen;
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CLEAN WALLET ENERGY', width/2, 80);
      
    } else if (template === 2) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width - 130, 30, 100, 100);
      } catch (e) {}
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(200, 300, 80, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(170, 280, 10, 0, Math.PI * 2);
      ctx.arc(230, 280, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(160, 330);
      ctx.lineTo(240, 330);
      ctx.stroke();
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(300, 200);
      ctx.lineTo(350, 250);
      ctx.lineTo(300, 300);
      ctx.lineTo(350, 350);
      ctx.lineTo(300, 400);
      ctx.stroke();
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(400, 150, 350, 300);
      ctx.stroke();
      
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          ctx.strokeStyle = row < 2 ? '#ff3333' : neonGreen;
          ctx.beginPath();
          ctx.rect(420 + col * 65, 170 + row * 70, 55, 55);
          ctx.stroke();
          if (row >= 2) {
            ctx.beginPath();
            ctx.moveTo(430 + col * 65, 195 + row * 70);
            ctx.lineTo(450 + col * 65, 215 + row * 70);
            ctx.lineTo(465 + col * 65, 180 + row * 70);
            ctx.stroke();
          }
        }
      }
      
      ctx.fillStyle = neonGreen;
      ctx.font = 'bold 35px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CLEANING IN PROGRESS', width/2, height - 60);
      
    } else if (template === 3) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, 50, 30, 80, 80);
      } catch (e) {}
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(200, 350, 80, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(175, 330, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.arc(225, 330, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(200, 370, 25, 0, Math.PI);
      ctx.stroke();
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(260, 320);
      ctx.lineTo(380, 280);
      ctx.lineTo(380, 200);
      ctx.stroke();
      
      ctx.strokeStyle = neonPurple;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(350, 120);
      ctx.quadraticCurveTo(420, 80, 450, 150);
      ctx.quadraticCurveTo(480, 100, 520, 140);
      ctx.quadraticCurveTo(560, 80, 600, 150);
      ctx.quadraticCurveTo(640, 200, 580, 250);
      ctx.lineTo(400, 250);
      ctx.quadraticCurveTo(320, 200, 350, 120);
      ctx.stroke();
      
      ctx.fillStyle = neonPurple;
      ctx.font = 'bold 25px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Is this free SOL?', 490, 190);
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(450, 350, 300, 180);
      ctx.stroke();
      ctx.fillStyle = neonGreen;
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Empty Accounts: 47', 470, 400);
      ctx.fillText('Locked SOL: 0.47', 470, 440);
      ctx.fillText('Status: RECLAIMABLE', 470, 480);
      
    } else {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      try {
        const logoPath = path.join(__dirname, '../attached_assets/Geometric _G_ in Gradient Colours_1762312635631.png');
        const logo = await loadImage(logoPath);
        ctx.drawImage(logo, width/2 - 50, 30, 100, 100);
      } catch (e) {}
      
      drawPerson(200, 280, 1.1, neonGreen, true);
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(350, 180, 400, 280);
      ctx.stroke();
      
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const y = 220 + i * 45;
        ctx.beginPath();
        ctx.arc(400, y, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(420, y);
        ctx.lineTo(600, y);
        ctx.stroke();
      }
      
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const x = 670 + i * 20;
        const h = 30 + i * 25;
        ctx.beginPath();
        ctx.rect(x, 420 - h, 15, h);
        ctx.stroke();
      }
      
      ctx.fillStyle = neonGreen;
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SOL GO UP', 720, 450);
      
      ctx.fillStyle = neonGreen;
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('BURNING TOKENS BE LIKE', width/2, height - 50);
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

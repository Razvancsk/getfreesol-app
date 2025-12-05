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
    if (template === 0) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#475569';
      ctx.fillRect(width/2 - 100, height/2 - 80, 200, 250);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(width/2 - 80, height/2 - 60, 160, 180);
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(width/2, height/2 + 140, 120, Math.PI, 0);
      ctx.fill();
      
      const tokenColors = ['#dc2626', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#8b5cf6'];
      for (let i = 0; i < 15; i++) {
        const x = width/2 - 60 + Math.random() * 120;
        const y = height/2 - 40 + Math.random() * 100;
        ctx.fillStyle = tokenColors[Math.floor(Math.random() * tokenColors.length)];
        ctx.beginPath();
        ctx.arc(x, y, 15 + Math.random() * 10, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.fillStyle = '#f97316';
      for (let i = 0; i < 8; i++) {
        const x = width/2 - 40 + Math.random() * 80;
        const y = height/2 + 100 + Math.random() * 60;
        const flameH = 20 + Math.random() * 30;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 10, y - flameH/2, x, y - flameH);
        ctx.quadraticCurveTo(x + 10, y - flameH/2, x, y);
        ctx.fill();
      }
      
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(width - 150, 150, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SOL', width - 150, 165);
      
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(width/2 + 60, height/2);
      ctx.lineTo(width - 180, 150);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(width - 175, 140);
      ctx.lineTo(width - 195, 160);
      ctx.lineTo(width - 175, 155);
      ctx.fill();
      
    } else if (template === 1) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#dc2626';
      for (let i = 0; i < 40; i++) {
        const x = 50 + Math.random() * (width - 100);
        const y = height - Math.random() * 300;
        const flameHeight = 40 + Math.random() * 120;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 15, y - flameHeight/2, x, y - flameHeight);
        ctx.quadraticCurveTo(x + 15, y - flameHeight/2, x, y);
        ctx.fill();
      }
      ctx.fillStyle = '#f97316';
      for (let i = 0; i < 25; i++) {
        const x = 80 + Math.random() * (width - 160);
        const y = height - Math.random() * 200;
        const flameHeight = 25 + Math.random() * 80;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 12, y - flameHeight/2, x, y - flameHeight);
        ctx.quadraticCurveTo(x + 12, y - flameHeight/2, x, y);
        ctx.fill();
      }
      
      const tokenColors = ['#a855f7', '#3b82f6', '#ec4899', '#14b8a6'];
      for (let i = 0; i < 12; i++) {
        const x = 100 + (i % 4) * 200;
        const y = 100 + Math.floor(i / 4) * 120 + Math.random() * 50;
        ctx.fillStyle = tokenColors[i % tokenColors.length];
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(x, y, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 40);
        ctx.lineTo(x, height - 150);
        ctx.stroke();
      }
      
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 70px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BURN TOKENS', width/2, 80);
      
    } else if (template === 2) {
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, width, height);
      
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const x = 100 + i * 140;
        const y = 120;
        ctx.strokeRect(x - 50, y - 50, 100, 120);
        
        ctx.fillStyle = '#7c3aed';
        ctx.fillRect(x - 40, y - 40, 80, 60);
        
        ctx.fillStyle = '#c4b5fd';
        ctx.beginPath();
        ctx.arc(x, y + 30, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.fillStyle = '#dc2626';
      for (let i = 0; i < 30; i++) {
        const x = 80 + Math.random() * (width - 160);
        const y = height - 50 - Math.random() * 200;
        const flameHeight = 30 + Math.random() * 80;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 12, y - flameHeight/2, x, y - flameHeight);
        ctx.quadraticCurveTo(x + 12, y - flameHeight/2, x, y);
        ctx.fill();
      }
      
      for (let i = 0; i < 6; i++) {
        const x = 100 + i * 140;
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 200);
        ctx.lineTo(x, height - 180);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 60px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BURN NFTs', width/2, height - 60);
      
    } else if (template === 3) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(100, 150, width - 200, 350, 20);
      ctx.fill();
      
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(120, 170, width - 240, 310, 15);
      ctx.fill();
      
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 8; col++) {
          const x = 160 + col * 85;
          const y = 210 + row * 90;
          ctx.fillStyle = '#475569';
          ctx.beginPath();
          ctx.roundRect(x, y, 65, 70, 8);
          ctx.fill();
          
          ctx.fillStyle = '#64748b';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('EMPTY', x + 32, y + 45);
        }
      }
      
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(width - 100, height/2, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SOL', width - 100, height/2 + 15);
      
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(width - 220, height/2);
      ctx.lineTo(width - 160, height/2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('RECLAIM RENT', width/2, height - 50);
      
    } else {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(width/2, 50);
      ctx.lineTo(width - 100, height/2);
      ctx.lineTo(width/2, height - 50);
      ctx.lineTo(100, height/2);
      ctx.closePath();
      ctx.fill();
      
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 4;
      ctx.stroke();
      
      const items = [
        { label: 'TOKENS', color: '#f97316', y: height/2 - 100 },
        { label: 'NFTs', color: '#a855f7', y: height/2 },
        { label: 'ACCOUNTS', color: '#3b82f6', y: height/2 + 100 },
      ];
      
      items.forEach((item, i) => {
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(200, item.y, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.label, 200, item.y + 5);
        
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(250, item.y);
        ctx.lineTo(width/2 - 50, height/2);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(width - 200, height/2, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 45px sans-serif';
      ctx.fillText('SOL', width - 200, height/2 + 15);
      
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(width/2 + 80, height/2);
      ctx.lineTo(width - 280, height/2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(width - 275, height/2 - 15);
      ctx.lineTo(width - 275, height/2 + 15);
      ctx.lineTo(width - 255, height/2);
      ctx.closePath();
      ctx.fill();
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

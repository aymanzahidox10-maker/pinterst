import { BannerStyle, PinData } from "../types";

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

export const generatePinCanvas = async (
  topImageSrc: string,
  bottomImageSrc: string,
  keyword: string,
  aspectRatio: '2:3' | '1:2',
  bannerStyle: BannerStyle
): Promise<string> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error("Could not get canvas context");

  // Dimensions
  const width = 1000;
  const height = aspectRatio === '2:3' ? 1500 : 2100;
  
  canvas.width = width;
  canvas.height = height;

  // Fill background white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  try {
    const [imgTop, imgBottom] = await Promise.all([
      loadImage(topImageSrc),
      loadImage(bottomImageSrc)
    ]);

    // Draw Split Images
    // Split height strictly 50/50 for now
    const splitH = height / 2;

    // Draw Top (Cover/Crop logic: Center crop)
    drawCover(ctx, imgTop, 0, 0, width, splitH);
    
    // Draw Bottom
    drawCover(ctx, imgBottom, 0, splitH, width, splitH);

    // --- BANNER ---
    const bannerW = 380;
    const bannerH = 120; // Slightly taller to accommodate text comfortably
    const bannerX = (width - bannerW) / 2;
    const bannerY = (height - bannerH) / 2;

    // Banner Background
    ctx.fillStyle = bannerStyle.backgroundColor;
    ctx.fillRect(bannerX, bannerY, bannerW, bannerH);

    // Banner Border (Dashed)
    // Drawn on the edge of the rect
    ctx.lineWidth = 4;
    ctx.setLineDash([15, 10]); // Dash pattern
    ctx.strokeStyle = bannerStyle.borderColor;
    ctx.strokeRect(bannerX, bannerY, bannerW, bannerH); 

    // Reset Line Dash for text
    ctx.setLineDash([]);

    // Text Styling
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = bannerStyle.textColor;
    
    // Dynamic Font Sizing
    let fontSize = 48;
    // Ensure font family is quoted if it has spaces for safety
    const fontName = bannerStyle.fontFamily.includes(' ') ? `"${bannerStyle.fontFamily}"` : bannerStyle.fontFamily;
    ctx.font = `bold ${fontSize}px ${fontName}, serif`;
    
    // Reduce font size if text is too wide
    const maxTextWidth = bannerW - 40;
    while (ctx.measureText(keyword).width > maxTextWidth && fontSize > 20) {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px ${fontName}, serif`;
    }

    // Text Stroke (Outline)
    if (bannerStyle.textBorderWidth > 0 && bannerStyle.textBorderColor) {
        ctx.lineWidth = bannerStyle.textBorderWidth;
        ctx.strokeStyle = bannerStyle.textBorderColor;
        ctx.strokeText(keyword, width / 2, height / 2);
    }

    // Fill Text
    ctx.fillText(keyword, width / 2, height / 2);

    return canvas.toDataURL('image/jpeg', 0.9);

  } catch (error) {
    console.error("Canvas Generation Failed", error);
    throw error;
  }
};

// Helper to draw image 'cover' style
function drawCover(
  ctx: CanvasRenderingContext2D, 
  img: HTMLImageElement, 
  x: number, 
  y: number, 
  w: number, 
  h: number
) {
  const imgRatio = img.width / img.height;
  const targetRatio = w / h;
  
  let renderW, renderH, renderX, renderY;

  if (targetRatio > imgRatio) {
    renderW = w;
    renderH = w / imgRatio;
    renderX = 0;
    renderY = (h - renderH) / 2;
  } else {
    renderH = h;
    renderW = h * imgRatio;
    renderX = (w - renderW) / 2;
    renderY = 0;
  }
  
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + renderX, y + renderY, renderW, renderH);
  ctx.restore();
}
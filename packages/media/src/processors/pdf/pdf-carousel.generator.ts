// packages/media/src/processors/pdf/pdf-carousel.generator.ts
import { promises as fs } from 'node:fs';
import { PDFDocument, type PDFImage } from 'pdf-lib';
import sharp from 'sharp';
import {
  type CarouselAspectRatio,
  type CarouselOptions,
  CarouselOptionsSchema,
  type GeneratedCarousel,
} from '../../contracts/pdf-carousel.contract.js';

export interface CardSlideContent {
  title: string;
  subtitle?: string | undefined;
  body?: string | undefined;
  bulletPoints?: string[] | undefined;
  slideNumber?: number | undefined;
  totalSlides?: number | undefined;
  branding?: string | undefined;
  theme?: 'dark' | 'light' | 'brand' | undefined;
  accentColor?: string | undefined;
  backgroundColor?: string | undefined;
  textColor?: string | undefined;
}

export class PdfCarouselError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'CAROUSEL_GENERATION_FAILED') {
    super(message);
    this.name = 'PdfCarouselError';
    this.code = code;
  }
}

export class PdfCarouselGenerator {
  /**
   * Generates a standardized multi-page PDF Carousel from an array of image sources.
   *
   * @param slides - Array of image Buffers, Uint8Arrays, file paths, or remote image URLs.
   * @param options - Carousel options (aspect ratio, title, metadata, fit).
   * @returns GeneratedCarousel containing PDF Buffer, metadata, page count, and dimensions.
   */
  public async generateFromImages(
    slides: Array<Buffer | Uint8Array | string>,
    options?: Partial<CarouselOptions>
  ): Promise<GeneratedCarousel> {
    if (!slides || slides.length === 0) {
      throw new PdfCarouselError(
        'At least one slide image is required to generate a PDF carousel',
        'EMPTY_SLIDES'
      );
    }

    const validatedOptions = CarouselOptionsSchema.parse(options || {});
    const { width, height } = this.resolveDimensions(validatedOptions.aspectRatio);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(validatedOptions.documentTitle);
    pdfDoc.setAuthor(validatedOptions.author);
    pdfDoc.setProducer('Scriora PDF Carousel Engine');
    pdfDoc.setCreator('Scriora Omnichannel OS');
    if (validatedOptions.subject) {
      pdfDoc.setSubject(validatedOptions.subject);
    }
    if (validatedOptions.keywords && validatedOptions.keywords.length > 0) {
      pdfDoc.setKeywords(validatedOptions.keywords);
    }
    const now = new Date();
    pdfDoc.setCreationDate(now);
    pdfDoc.setModificationDate(now);

    for (let i = 0; i < slides.length; i++) {
      const slideInput = slides[i];
      if (!slideInput) {
        continue;
      }
      const rawBuffer = await this.resolveInputBuffer(slideInput, i);

      // Standardize image with sharp
      const processedImage = await this.processImage(rawBuffer, width, height, validatedOptions);

      // Embed into PDF
      let pdfImage: PDFImage;
      if (processedImage.isPng) {
        pdfImage = await pdfDoc.embedPng(processedImage.buffer);
      } else {
        pdfImage = await pdfDoc.embedJpg(processedImage.buffer);
      }

      // Add page with standard LinkedIn dimensions
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    return {
      buffer: pdfBuffer,
      pageCount: pdfDoc.getPageCount(),
      sizeBytes: pdfBuffer.length,
      mimeType: 'application/pdf',
      width,
      height,
      aspectRatio: validatedOptions.aspectRatio,
    };
  }

  /**
   * Renders a structured text card into a high-resolution PNG slide buffer.
   */
  public async renderSlideCard(
    content: CardSlideContent,
    aspectRatio: CarouselAspectRatio = '1:1'
  ): Promise<Buffer> {
    const { width, height } = this.resolveDimensions(aspectRatio);

    const theme = content.theme || 'dark';
    const bg = content.backgroundColor || (theme === 'dark' ? '#0f172a' : '#ffffff');
    const textPrimary = content.textColor || (theme === 'dark' ? '#f8fafc' : '#0f172a');
    const textSecondary = theme === 'dark' ? '#94a3b8' : '#64748b';
    const accent = content.accentColor || '#38bdf8';
    const branding = content.branding || 'Scriora';

    const slideCounter =
      content.slideNumber !== undefined && content.totalSlides !== undefined
        ? `${content.slideNumber} / ${content.totalSlides}`
        : '';

    const bulletsMarkup = (content.bulletPoints || [])
      .map(
        (bp, index) =>
          `<g transform="translate(0, ${index * 60})">
            <circle cx="20" cy="18" r="8" fill="${accent}"/>
            <text x="45" y="26" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="500" fill="${textPrimary}">
              ${this.escapeXml(bp)}
            </text>
          </g>`
      )
      .join('\n');

    const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="${theme === 'dark' ? '#020617' : '#f1f5f9'}"/>
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${height}" fill="url(#cardGrad)"/>

      <!-- Accent Top Border -->
      <rect x="0" y="0" width="${width}" height="12" fill="${accent}"/>

      <!-- Header: Branding & Slide Counter -->
      <text x="80" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="700" fill="${accent}" letter-spacing="1">
        ${this.escapeXml(branding)}
      </text>

      ${
        slideCounter
          ? `<text x="${width - 80}" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" fill="${textSecondary}" text-anchor="end">
              ${this.escapeXml(slideCounter)}
             </text>`
          : ''
      }

      <!-- Main Content Area -->
      <g transform="translate(80, 220)">
        <!-- Title -->
        <text x="0" y="0" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="800" fill="${textPrimary}">
          ${this.escapeXml(content.title)}
        </text>

        <!-- Subtitle -->
        ${
          content.subtitle
            ? `<text x="0" y="70" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="400" fill="${textSecondary}">
                ${this.escapeXml(content.subtitle)}
               </text>`
            : ''
        }

        <!-- Body text -->
        ${
          content.body
            ? `<text x="0" y="140" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="400" fill="${textPrimary}">
                ${this.escapeXml(content.body)}
               </text>`
            : ''
        }

        <!-- Bullet points -->
        ${
          bulletsMarkup
            ? `<g transform="translate(0, ${content.body ? 220 : 150})">
                ${bulletsMarkup}
               </g>`
            : ''
        }
      </g>

      <!-- Footer -->
      <rect x="80" y="${height - 100}" width="${width - 160}" height="1" fill="${textSecondary}" opacity="0.2"/>
      <text x="80" y="${height - 60}" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="500" fill="${textSecondary}">
        Swipe for more →
      </text>
    </svg>`;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  private resolveDimensions(aspectRatio: CarouselAspectRatio): { width: number; height: number } {
    if (aspectRatio === '4:5') {
      return { width: 1080, height: 1350 };
    }
    return { width: 1080, height: 1080 };
  }

  private async resolveInputBuffer(
    input: Buffer | Uint8Array | string,
    index: number
  ): Promise<Buffer> {
    if (Buffer.isBuffer(input)) {
      return input;
    }
    if (input instanceof Uint8Array) {
      return Buffer.from(input);
    }
    if (typeof input === 'string') {
      if (input.startsWith('http://') || input.startsWith('https://')) {
        const res = await fetch(input);
        if (!res.ok) {
          throw new PdfCarouselError(
            `Failed to fetch remote slide image from ${input} (HTTP ${res.status})`,
            'DOWNLOAD_FAILED'
          );
        }
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
      try {
        return await fs.readFile(input);
      } catch (err: unknown) {
        throw new PdfCarouselError(
          `Failed to read local slide image at path ${input}: ${err instanceof Error ? err.message : String(err)}`,
          'FILE_READ_FAILED'
        );
      }
    }

    throw new PdfCarouselError(
      `Unsupported slide input type at index ${index}`,
      'INVALID_INPUT_TYPE'
    );
  }

  private async processImage(
    rawBuffer: Buffer,
    targetWidth: number,
    targetHeight: number,
    options: CarouselOptions
  ): Promise<{ buffer: Buffer; isPng: boolean }> {
    try {
      const metadata = await sharp(rawBuffer).metadata();
      const hasAlpha = metadata.hasAlpha === true;

      const pipeline = sharp(rawBuffer)
        .rotate() // auto-orient EXIF
        .resize({
          width: targetWidth,
          height: targetHeight,
          fit: options.fit,
          background: options.backgroundColor,
          kernel: sharp.kernel.lanczos3,
        });

      if (hasAlpha) {
        const pngBuf = await pipeline.png({ compressionLevel: 8 }).toBuffer();
        return { buffer: pngBuf, isPng: true };
      }

      const jpgBuf = await pipeline
        .jpeg({ quality: options.quality, progressive: false })
        .toBuffer();
      return { buffer: jpgBuf, isPng: false };
    } catch (err: unknown) {
      throw new PdfCarouselError(
        `Failed to process image slide: ${err instanceof Error ? err.message : String(err)}`,
        'IMAGE_PROCESSING_FAILED'
      );
    }
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

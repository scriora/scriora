// packages/media/test/unit/pdf-carousel.generator.test.ts

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  PdfCarouselError,
  PdfCarouselGenerator,
} from '../../src/processors/pdf/pdf-carousel.generator.js';

describe('PdfCarouselGenerator', () => {
  const generator = new PdfCarouselGenerator();

  // Helper to create a test solid-color PNG image buffer
  async function createTestImage(
    width: number,
    height: number,
    color: { r: number; g: number; b: number }
  ): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: color,
      },
    })
      .png()
      .toBuffer();
  }

  it('generates a valid 1:1 multi-page PDF carousel from image buffers', async () => {
    const slide1 = await createTestImage(800, 600, { r: 56, g: 189, b: 248 }); // #38bdf8
    const slide2 = await createTestImage(1200, 1200, { r: 168, g: 85, b: 247 }); // #a855f7
    const slide3 = await createTestImage(1080, 1080, { r: 34, g: 197, b: 94 }); // #22c55e

    const result = await generator.generateFromImages([slide1, slide2, slide3], {
      aspectRatio: '1:1',
      documentTitle: 'Scriora Feature Showcase',
      author: 'Scriora Engine',
      subject: 'Social Media Carousel',
      keywords: ['saas', 'automation', 'carousel'],
    });

    expect(result.pageCount).toBe(3);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.aspectRatio).toBe('1:1');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.sizeBytes).toBeGreaterThan(1000);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);

    // Verify PDF header magic bytes "%PDF-"
    const header = result.buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');

    // Verify with pdf-lib
    const loadedDoc = await PDFDocument.load(result.buffer);
    expect(loadedDoc.getPageCount()).toBe(3);
    expect(loadedDoc.getTitle()).toBe('Scriora Feature Showcase');
    expect(loadedDoc.getAuthor()).toBe('Scriora Engine');
    expect(loadedDoc.getSubject()).toBe('Social Media Carousel');

    const firstPage = loadedDoc.getPage(0);
    expect(firstPage.getWidth()).toBe(1080);
    expect(firstPage.getHeight()).toBe(1080);
  });

  it('generates a 4:5 portrait PDF carousel with 1080x1350 dimensions', async () => {
    const slide1 = await createTestImage(600, 800, { r: 249, g: 115, b: 22 }); // #f97316
    const slide2 = await createTestImage(600, 800, { r: 236, g: 72, b: 153 }); // #ec4899

    const result = await generator.generateFromImages([slide1, slide2], {
      aspectRatio: '4:5',
      documentTitle: 'Portrait Carousel',
    });

    expect(result.pageCount).toBe(2);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
    expect(result.aspectRatio).toBe('4:5');

    const loadedDoc = await PDFDocument.load(result.buffer);
    const firstPage = loadedDoc.getPage(0);
    expect(firstPage.getWidth()).toBe(1080);
    expect(firstPage.getHeight()).toBe(1350);
  });

  it('renders structured text card slides into PNG buffers and compiles to PDF', async () => {
    const slide1Buf = await generator.renderSlideCard(
      {
        title: 'LinkedIn Algorithm 2026',
        subtitle: 'The ultimate guide to maximum reach',
        slideNumber: 1,
        totalSlides: 3,
        branding: 'Scriora Insights',
        theme: 'dark',
        bulletPoints: [
          'PDF Carousels yield +596% engagement',
          'Peak engagement shifted to 3:00 PM - 8:00 PM',
          'Wednesday 4:00 PM is peak day',
        ],
      },
      '1:1'
    );

    const slide2Buf = await generator.renderSlideCard(
      {
        title: 'Smart Scheduling Engine',
        subtitle: 'Auto-pilot your feed at optimal hours',
        slideNumber: 2,
        totalSlides: 3,
        branding: 'Scriora Insights',
        theme: 'dark',
        body: 'Scriora analyzes engagement trends and queues your content during peak algorithmic windows.',
      },
      '1:1'
    );

    expect(Buffer.isBuffer(slide1Buf)).toBe(true);
    expect(Buffer.isBuffer(slide2Buf)).toBe(true);

    const carousel = await generator.generateFromImages([slide1Buf, slide2Buf], {
      documentTitle: 'LinkedIn Strategy 2026',
      author: 'Mohamed Shaban',
    });

    expect(carousel.pageCount).toBe(2);
    expect(carousel.mimeType).toBe('application/pdf');
    expect(carousel.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('throws descriptive error on empty slides array', async () => {
    await expect(generator.generateFromImages([])).rejects.toThrow(PdfCarouselError);
    await expect(generator.generateFromImages([])).rejects.toThrow(
      'At least one slide image is required'
    );
  });

  it('throws descriptive error when given corrupt/invalid image buffer', async () => {
    const corruptBuffer = Buffer.from('NOT_AN_IMAGE_DATA_AT_ALL');
    await expect(generator.generateFromImages([corruptBuffer])).rejects.toThrow(PdfCarouselError);
  });
});

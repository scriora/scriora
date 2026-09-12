// packages/media/src/contracts/pdf-carousel.contract.ts
import { z } from 'zod';

export const CarouselAspectRatioSchema = z.enum(['1:1', '4:5']);
export type CarouselAspectRatio = z.infer<typeof CarouselAspectRatioSchema>;

export const CarouselFitModeSchema = z.enum(['contain', 'cover']);
export type CarouselFitMode = z.infer<typeof CarouselFitModeSchema>;

export const CarouselOptionsSchema = z.object({
  aspectRatio: CarouselAspectRatioSchema.default('1:1'),
  fit: CarouselFitModeSchema.default('contain'),
  backgroundColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).default('#ffffff'),
  documentTitle: z.string().min(1).max(255).default('Scriora Carousel'),
  author: z.string().min(1).max(100).default('Scriora'),
  subject: z.string().max(255).optional(),
  keywords: z.array(z.string()).optional(),
  quality: z.number().int().min(50).max(100).default(90),
});

export type CarouselOptions = z.infer<typeof CarouselOptionsSchema>;

export interface GeneratedCarousel {
  buffer: Buffer;
  pageCount: number;
  sizeBytes: number;
  mimeType: 'application/pdf';
  width: number;
  height: number;
  aspectRatio: CarouselAspectRatio;
}

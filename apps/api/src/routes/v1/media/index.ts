import type { FastifyPluginAsync } from 'fastify';
import { PdfCarouselGenerator } from 'scriora-media';
import { z } from 'zod';
import { requireWorkspaceWrite } from '../../../lib/rbac.js';
import { err, ok } from '../../../lib/response.js';
import { verifyAuth } from '../../../middleware/auth.js';
import { verifyWorkspace } from '../../../middleware/workspace.js';

const SlideContentSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(255).optional(),
  body: z.string().max(1000).optional(),
  bulletPoints: z.array(z.string().max(200)).max(10).optional(),
  theme: z.enum(['dark', 'light', 'brand']).optional(),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional(),
  backgroundColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional(),
  textColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional(),
  branding: z.string().max(50).optional(),
});

const GenerateCarouselBodySchema = z.object({
  slides: z
    .array(z.union([SlideContentSchema, z.string().min(1)]))
    .min(1, 'At least one slide is required')
    .max(50, 'Max 50 slides per carousel'),
  options: z
    .object({
      aspectRatio: z.enum(['1:1', '4:5']).default('1:1'),
      documentTitle: z.string().min(1).max(255).default('Scriora Carousel'),
      author: z.string().min(1).max(100).optional(),
      subject: z.string().max(255).optional(),
      keywords: z.array(z.string()).optional(),
    })
    .default({
      aspectRatio: '1:1',
      documentTitle: 'Scriora Carousel',
    }),
});

const DownloadQuerySchema = z.object({
  download: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1'),
});

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', verifyAuth);
  fastify.addHook('preHandler', verifyWorkspace);

  const carouselGenerator = new PdfCarouselGenerator();

  /**
   * POST /v1/media/carousel
   * Generates an interactive multi-page PDF Carousel document from structured slides or images.
   */
  fastify.post('/carousel', { preHandler: [requireWorkspaceWrite] }, async (request, reply) => {
    const parseResult = GenerateCarouselBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(
        err(
          'VALIDATION_ERROR',
          'VALIDATION_ERROR',
          'Invalid carousel generation payload',
          request.id,
          false,
          parseResult.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          }))
        )
      );
    }

    const { slides, options } = parseResult.data;
    const query = DownloadQuerySchema.parse(request.query || {});
    const authorName = options.author || request.authContext?.email || 'Scriora';

    try {
      // 1. Process slides: render structured cards into image buffers, or keep raw URLs/buffers
      const processedSlideBuffers: Array<Buffer | string> = [];
      const totalSlides = slides.length;

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i]!;
        if (typeof slide === 'string') {
          processedSlideBuffers.push(slide);
        } else {
          // Structured text slide -> render to PNG buffer via Sharp + SVG
          const renderedPng = await carouselGenerator.renderSlideCard(
            {
              ...slide,
              slideNumber: i + 1,
              totalSlides,
              branding: slide.branding || options.documentTitle,
            },
            options.aspectRatio
          );
          processedSlideBuffers.push(renderedPng);
        }
      }

      // 2. Compile into PDF Carousel
      const result = await carouselGenerator.generateFromImages(processedSlideBuffers, {
        aspectRatio: options.aspectRatio,
        documentTitle: options.documentTitle,
        author: authorName,
        subject: options.subject,
        keywords: options.keywords,
      });

      // 3. Return raw PDF stream or JSON with Base64 payload
      if (query.download) {
        return reply
          .header('Content-Type', 'application/pdf')
          .header(
            'Content-Disposition',
            `attachment; filename="${encodeURIComponent(options.documentTitle)}.pdf"`
          )
          .send(result.buffer);
      }

      return reply.status(201).send(
        ok(
          {
            documentTitle: options.documentTitle,
            pageCount: result.pageCount,
            sizeBytes: result.sizeBytes,
            mimeType: result.mimeType,
            aspectRatio: result.aspectRatio,
            width: result.width,
            height: result.height,
            pdfBase64: result.buffer.toString('base64'),
          },
          request.id
        )
      );
    } catch (generateError: unknown) {
      const message =
        generateError instanceof Error ? generateError.message : 'Failed to generate carousel';
      return reply
        .status(500)
        .send(err('CAROUSEL_GENERATION_FAILED', 'INTERNAL_ERROR', message, request.id));
    }
  });
};

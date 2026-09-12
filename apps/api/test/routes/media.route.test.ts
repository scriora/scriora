import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('API Routes — Media & Carousel Generator', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /v1/media/carousel returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/carousel',
      payload: {
        slides: [
          {
            title: 'Test Slide',
            subtitle: 'Slide Subtitle',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.category).toBe('AUTHENTICATION_ERROR');
  });

  it('POST /v1/media/carousel returns 400 when slides array is empty', async () => {
    const { prisma } = await import('scriora-core');
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Test Workspace',
        slug: 'test-ws',
      },
    } as any);

    const token = app.jwt.sign({
      sub: 'user-123',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      role: 'OWNER',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/carousel',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '22222222-2222-4222-8222-222222222222',
      },
      payload: {
        slides: [],
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /v1/media/carousel successfully generates PDF carousel and returns 201 with base64', async () => {
    const { prisma } = await import('scriora-core');
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Test Workspace',
        slug: 'test-ws',
      },
    } as any);

    const token = app.jwt.sign({
      sub: 'user-123',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      role: 'OWNER',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/carousel',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '22222222-2222-4222-8222-222222222222',
      },
      payload: {
        slides: [
          {
            title: 'Welcome to Scriora Carousel',
            subtitle: 'Automated Multi-Platform Publishing',
            bulletPoints: [
              'High Resolution 1080x1080',
              'Vector Quality',
              'Instant LinkedIn Posting',
            ],
          },
          {
            title: 'Engagement Booster',
            subtitle: '+596% Engagement on LinkedIn',
            body: 'PDF Carousels keep users swiping and reading longer.',
          },
        ],
        options: {
          aspectRatio: '1:1',
          documentTitle: 'Scriora API Playbook',
          author: 'Scriora Test',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.pageCount).toBe(2);
    expect(json.data.aspectRatio).toBe('1:1');
    expect(json.data.mimeType).toBe('application/pdf');
    expect(json.data.pdfBase64).toBeDefined();
    expect(typeof json.data.pdfBase64).toBe('string');
  });

  it('POST /v1/media/carousel?download=true streams application/pdf binary', async () => {
    const { prisma } = await import('scriora-core');
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      userId: 'user-123',
      workspaceRole: 'OWNER',
      joinedAt: new Date(),
      workspace: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Test Workspace',
        slug: 'test-ws',
      },
    } as any);

    const token = app.jwt.sign({
      sub: 'user-123',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      role: 'OWNER',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/carousel?download=true',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '22222222-2222-4222-8222-222222222222',
      },
      payload: {
        slides: [
          {
            title: 'Downloadable PDF',
            subtitle: 'Checking Content-Type and Disposition',
          },
        ],
        options: {
          aspectRatio: '1:1',
          documentTitle: 'DownloadTest',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('POST /v1/media/carousel rejects file:// and private slide URLs', async () => {
    const { prisma } = await import('scriora-core');
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      userId: 'user-123',
      workspaceRole: 'EDITOR',
      joinedAt: new Date(),
      workspace: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Test Workspace',
        slug: 'test-ws',
      },
    } as any);

    const token = app.jwt.sign({
      sub: 'user-123',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      role: 'EDITOR',
    });

    const fileRes = await app.inject({
      method: 'POST',
      url: '/v1/media/carousel',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '22222222-2222-4222-8222-222222222222',
      },
      payload: {
        slides: ['file:///etc/passwd'],
      },
    });
    expect(fileRes.statusCode).toBe(400);
    expect(JSON.parse(fileRes.body).error.code).toBe('UNSAFE_REMOTE_URL');

    const privateRes = await app.inject({
      method: 'POST',
      url: '/v1/media/carousel',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '22222222-2222-4222-8222-222222222222',
      },
      payload: {
        slides: ['https://169.254.169.254/latest/meta-data'],
      },
    });
    expect(privateRes.statusCode).toBe(400);
    expect(JSON.parse(privateRes.body).error.code).toBe('UNSAFE_REMOTE_URL');
  });
});

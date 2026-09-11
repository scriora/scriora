import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('API Routes — Posts (Unified Gateway)', () => {
  const app = buildApp();

  it('POST /v1/posts returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      payload: {
        body: 'Hello world from Scriora!',
        targets: [
          {
            socialAccountId: '11111111-1111-4111-8111-111111111111',
            platform: 'LINKEDIN',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.category).toBe('AUTHENTICATION_ERROR');
    expect(json.meta.requestId).toBeDefined();
  });

  it('POST /v1/posts returns 400 when payload is missing required fields', async () => {
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
        purpose: 'WORK',
        defaultOperatingMode: 'MANUAL',
        ownerUserId: 'user-123',
        country: null,
        timezone: 'UTC',
        requiresApproval: false,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    // Generate valid JWT token using app.jwt
    const token = app.jwt.sign({ sub: 'user-123' });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/posts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': '22222222-2222-4222-8222-222222222222',
      },
      payload: {
        body: '', // Empty body is invalid
        targets: [],
      },
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details).toBeDefined();
  });
});

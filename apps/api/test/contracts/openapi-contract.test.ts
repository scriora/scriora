import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

const HTTP_METHODS = ['delete', 'get', 'patch', 'post', 'put'] as const;
const snapshotPath = fileURLToPath(new URL('../../../docs/openapi/openapi.json', import.meta.url));
const app = buildApp();

function operationInventory(document: { paths?: Record<string, Record<string, unknown>> }) {
  return Object.entries(document.paths ?? {})
    .flatMap(([path, operations]) =>
      HTTP_METHODS.filter((method) => method in operations).map(
        (method) => `${method.toUpperCase()} ${path}`
      )
    )
    .sort();
}

describe('OpenAPI route contract', () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the committed document synchronized with registered API routes', async () => {
    const committedDocument = JSON.parse(await readFile(snapshotPath, 'utf8'));
    expect(operationInventory(committedDocument)).toEqual(operationInventory(app.swagger()));
  });

  it.each([
    'POST /api/v1/publications/',
    'POST /v1/media/carousel',
    'POST /v1/webhooks/telegram/',
    'GET /v1/posts/smart-schedule',
    'POST /v1/posts/optimize-cross-post',
    'GET /v1/social-accounts/{accountId}/messages',
    'GET /v1/social-accounts/{accountId}/smart-schedule',
  ])('documents required operation %s', (operation) => {
    expect(operationInventory(app.swagger())).toContain(operation);
  });
});

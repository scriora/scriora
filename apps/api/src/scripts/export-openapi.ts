import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';

process.env.NODE_ENV = 'test';

const outputPath = fileURLToPath(new URL('../../../docs/openapi/openapi.json', import.meta.url));
const app = buildApp();

try {
  await app.ready();
  await writeFile(outputPath, `${JSON.stringify(app.swagger(), null, 2)}\n`, 'utf8');
  console.log(`OpenAPI document written to ${outputPath}`);
} finally {
  await app.close();
}

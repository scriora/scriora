import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneRoot = join(webRoot, '.next', 'standalone', 'apps', 'web');

await mkdir(join(standaloneRoot, '.next'), { recursive: true });
await cp(join(webRoot, '.next', 'static'), join(standaloneRoot, '.next', 'static'), {
  recursive: true,
  force: true,
});
await cp(join(webRoot, 'public'), join(standaloneRoot, 'public'), {
  recursive: true,
  force: true,
});

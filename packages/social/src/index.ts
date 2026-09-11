// scriora-social — Canonical Public API (Anti-Corruption Layer)
export * from './contracts/platform.contract.js';
export * from './errors/social.error.js';
export * from './platforms/linkedin/mock.adapter.js';
export * from './registry/platform.registry.js';

import { MockLinkedInAdapter } from './platforms/linkedin/mock.adapter.js';
// Auto-register default mock adapters for local/testing environments
import { platformRegistry } from './registry/platform.registry.js';

platformRegistry.register(new MockLinkedInAdapter());

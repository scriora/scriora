import { describe, expect, it } from 'vitest';
import '../../src/index.js';
import { MockLinkedInAdapter } from '../../src/platforms/linkedin/mock.adapter.js';
import { PlatformRegistry, platformRegistry } from '../../src/registry/platform.registry.js';

describe('PlatformRegistry Unit Tests', () => {
  it('has LinkedIn registered by default from index bootstrap', () => {
    expect(platformRegistry.has('LINKEDIN')).toBe(true);
    const adapter = platformRegistry.get('LINKEDIN');
    expect(adapter.platform).toBe('LINKEDIN');
  });

  it('throws for unregistered platform', () => {
    expect(() => platformRegistry.get('TIKTOK')).toThrow('PLATFORM_ADAPTER_NOT_REGISTERED: TIKTOK');
  });

  it('lists all supported platforms', () => {
    const platforms = platformRegistry.getSupportedPlatforms();
    expect(platforms).toContain('LINKEDIN');
  });

  it('supports clearing and re-registering adapters', () => {
    const singleton = PlatformRegistry.getInstance();
    expect(singleton).toBe(platformRegistry);

    const adapter = new MockLinkedInAdapter();
    platformRegistry.clear();
    expect(platformRegistry.getSupportedPlatforms().length).toBe(0);
    expect(platformRegistry.has('LINKEDIN')).toBe(false);

    platformRegistry.register(adapter);
    expect(platformRegistry.has('LINKEDIN')).toBe(true);
    expect(platformRegistry.get('LINKEDIN')).toBe(adapter);
  });
});

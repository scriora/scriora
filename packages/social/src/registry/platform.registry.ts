import type { PlatformAdapter, SocialPlatformType } from '../contracts/platform.contract.js';

export class PlatformRegistry {
  private static instance: PlatformRegistry;
  private readonly adapters = new Map<SocialPlatformType, PlatformAdapter>();

  private constructor() {}

  public static getInstance(): PlatformRegistry {
    if (!PlatformRegistry.instance) {
      PlatformRegistry.instance = new PlatformRegistry();
    }
    return PlatformRegistry.instance;
  }

  public register(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  public get(platform: SocialPlatformType): PlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`PLATFORM_ADAPTER_NOT_REGISTERED: ${platform}`);
    }
    return adapter;
  }

  public has(platform: SocialPlatformType): boolean {
    return this.adapters.has(platform);
  }

  public getSupportedPlatforms(): SocialPlatformType[] {
    return Array.from(this.adapters.keys());
  }

  public clear(): void {
    this.adapters.clear();
  }
}

export const platformRegistry = PlatformRegistry.getInstance();

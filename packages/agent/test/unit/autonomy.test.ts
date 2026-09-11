import { describe, expect, it } from 'vitest';
import { ALWAYS_REQUIRES_APPROVAL, AutonomyLevel } from '../../src/runtime/autonomy.js';

describe('Autonomy Definitions Tests', () => {
  it('defines the expected hierarchy of autonomy levels', () => {
    expect(AutonomyLevel.L0_OBSERVE).toBe(0);
    expect(AutonomyLevel.L1_SUGGEST).toBe(1);
    expect(AutonomyLevel.L2_EXECUTE_NOTIFY).toBe(2);
    expect(AutonomyLevel.L3_EXECUTE_APPROVE).toBe(3);
    expect(AutonomyLevel.L4_AUTONOMOUS).toBe(4);
  });

  it('declares actions that always require human approval', () => {
    expect(ALWAYS_REQUIRES_APPROVAL).toContain('publication.publish');
    expect(ALWAYS_REQUIRES_APPROVAL).toContain('mission.abandon');
    expect(ALWAYS_REQUIRES_APPROVAL).toContain('workspace.delete');
    expect(ALWAYS_REQUIRES_APPROVAL).toContain('social_account.disconnect');
  });
});

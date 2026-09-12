import { describe, expect, it } from 'vitest';
import {
  ALWAYS_REQUIRES_APPROVAL,
  AutonomyLevel,
  evaluateAutonomyGate,
  isAlwaysApprovalAction,
} from '../../src/runtime/autonomy.js';

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
    expect(isAlwaysApprovalAction('publication.publish')).toBe(true);
    expect(isAlwaysApprovalAction('content.draft')).toBe(false);
  });

  it('forces approval for publication.publish at L4_AUTONOMOUS', () => {
    const decision = evaluateAutonomyGate({
      action: 'publication.publish',
      autonomyLevel: AutonomyLevel.L4_AUTONOMOUS,
      workspaceRequiresApproval: false,
    });
    expect(decision).toEqual({
      allowed: true,
      requiresApproval: true,
      reason: 'ALWAYS_REQUIRES_APPROVAL',
    });
  });

  it('denies L0 observe for always-approval actions', () => {
    const decision = evaluateAutonomyGate({
      action: 'publication.publish',
      autonomyLevel: AutonomyLevel.L0_OBSERVE,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) {
      return;
    }
    expect(decision.code).toBe('AUTONOMY_READ_ONLY');
  });

  it('allows already-approved publication.publish through the gate', () => {
    expect(
      evaluateAutonomyGate({
        action: 'publication.publish',
        hasHumanApproval: true,
      })
    ).toEqual({ allowed: true, requiresApproval: false });
  });

  it('does not require approval for a non-dangerous action at L2', () => {
    expect(
      evaluateAutonomyGate({
        action: 'analytics.read',
        autonomyLevel: AutonomyLevel.L2_EXECUTE_NOTIFY,
      })
    ).toEqual({ allowed: true, requiresApproval: false });
  });
});

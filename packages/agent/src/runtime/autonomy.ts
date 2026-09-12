// Autonomy Level Definitions
// Reference: scriora-docs/architecture/SCRIORA_AGENT_FRAMEWORK.md
export const AutonomyLevel = {
  /** L0: Read-only observation and reporting */
  L0_OBSERVE: 0,
  /** L1: Draft suggestions for human review */
  L1_SUGGEST: 1,
  /** L2: Execute with post-action notification */
  L2_EXECUTE_NOTIFY: 2,
  /** L3: Execute with pre-action approval required */
  L3_EXECUTE_APPROVE: 3,
  /** L4: Full autonomy within policy bounds */
  L4_AUTONOMOUS: 4,
} as const;
export type AutonomyLevel = (typeof AutonomyLevel)[keyof typeof AutonomyLevel];
// Actions that ALWAYS require human approval regardless of autonomy level
export const ALWAYS_REQUIRES_APPROVAL = [
  'publication.publish',
  'mission.abandon',
  'workspace.delete',
  'social_account.disconnect',
] as const;

export type AlwaysApprovalAction = (typeof ALWAYS_REQUIRES_APPROVAL)[number];

export function isAlwaysApprovalAction(action: string): action is AlwaysApprovalAction {
  return (ALWAYS_REQUIRES_APPROVAL as readonly string[]).includes(action);
}

export type AutonomyGateDecision =
  | { allowed: true; requiresApproval: false }
  | { allowed: true; requiresApproval: true; reason: string }
  | { allowed: false; code: string; reason: string };

/**
 * Minimal enforcement for agent / MCP dangerous actions.
 *
 * L4_AUTONOMOUS is not a bypass: ALWAYS_REQUIRES_APPROVAL still holds.
 * Classic HTTP `POST /v1/posts` continues to use workspace.requiresApproval;
 * this gate is the extra control plane for agent/MCP publication.publish.
 */
export function evaluateAutonomyGate(input: {
  action: string;
  autonomyLevel?: AutonomyLevel;
  workspaceRequiresApproval?: boolean;
  hasHumanApproval?: boolean;
}): AutonomyGateDecision {
  const always = isAlwaysApprovalAction(input.action);
  const level = input.autonomyLevel;

  if (level === AutonomyLevel.L0_OBSERVE && always) {
    return {
      allowed: false,
      code: 'AUTONOMY_READ_ONLY',
      reason: 'L0_OBSERVE cannot execute actions that always require approval',
    };
  }

  const requiresApproval =
    always ||
    Boolean(input.workspaceRequiresApproval) ||
    level === AutonomyLevel.L3_EXECUTE_APPROVE;

  if (!requiresApproval) {
    return { allowed: true, requiresApproval: false };
  }

  if (input.hasHumanApproval) {
    return { allowed: true, requiresApproval: false };
  }

  return {
    allowed: true,
    requiresApproval: true,
    reason: always
      ? 'ALWAYS_REQUIRES_APPROVAL'
      : level === AutonomyLevel.L3_EXECUTE_APPROVE
        ? 'AUTONOMY_LEVEL_REQUIRES_APPROVAL'
        : 'WORKSPACE_REQUIRES_APPROVAL',
  };
}

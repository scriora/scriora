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

// Skill Contract — defines the interface every Skill must implement
// Reference: scriora-docs/architecture/SCRIORA_AGENT_FRAMEWORK.md
// RULE: Tools ≠ Skills
//   Skill = stateless, composable unit of cognitive work
//   Tool  = stateful action with external side-effects
import { z } from 'zod';
export const SkillMetadataSchema = z.object({
  name: z.string(),
  version: z.string(), // SemVer e.g. "1.0.0"
  description: z.string(),
  type: z.enum(['DETERMINISTIC', 'AI_DRIVEN']),
});
export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
export interface SkillContract<TInput, TOutput> {
  readonly metadata: SkillMetadata;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  execute(input: TInput): Promise<TOutput>;
}

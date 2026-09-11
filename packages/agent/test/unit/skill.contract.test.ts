import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  type SkillContract,
  SkillMetadataSchema,
} from '../../src/skills/registry/skill.contract.js';

describe('Skill Contract Tests', () => {
  it('validates skill metadata successfully', () => {
    const validMeta = {
      name: 'caption-generator',
      version: '1.0.0',
      description: 'Generates social media captions',
      type: 'AI_DRIVEN' as const,
    };
    expect(SkillMetadataSchema.parse(validMeta)).toEqual(validMeta);
  });

  it('rejects invalid skill metadata', () => {
    expect(() =>
      SkillMetadataSchema.parse({
        name: 'test',
        version: '1.0.0',
        description: 'test',
        type: 'INVALID_TYPE',
      })
    ).toThrow();
  });

  it('allows constructing a compliant SkillContract implementation', async () => {
    const testSkill: SkillContract<{ text: string }, { uppercase: string }> = {
      metadata: {
        name: 'upper-case-skill',
        version: '1.0.0',
        description: 'Converts text to uppercase',
        type: 'DETERMINISTIC',
      },
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ uppercase: z.string() }),
      execute: async (input) => ({ uppercase: input.text.toUpperCase() }),
    };

    const result = await testSkill.execute({ text: 'scriora' });
    expect(result.uppercase).toBe('SCRIORA');
  });
});

// MCP Tool Contract — defines what every exposed tool must declare
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md
// RULE: MCP tools wrap Application Contracts — never bypass them

import { z } from 'zod';

export const MCPToolMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  requiresApproval: z.boolean(),
  requiredPermissions: z.array(z.string()),
});

export type MCPToolMetadata = z.infer<typeof MCPToolMetadataSchema>;

export interface MCPToolContract<TInput, TOutput> {
  readonly metadata: MCPToolMetadata;
  readonly inputSchema: z.ZodType<TInput>;
  execute(input: TInput, context: MCPExecutionContext): Promise<TOutput>;
}

export interface MCPExecutionContext {
  workspaceId: string;
  requestId: string;
  apiKeyId: string;
}

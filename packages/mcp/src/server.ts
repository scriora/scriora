// scriora-mcp — MCP Protocol Server
// Exposes Scriora capabilities to external AI clients via Model Context Protocol
// Protocol version: 2024-11-05
// INVARIANT: This server CANNOT bypass the Human Approval Gate.
//            Every action that requires approval must go through
//            the approval flow — never directly to execution.
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'scriora-mcp',
  version: '0.1.0',
});

// Tools and resources will be registered here in Phase 1
// Reference: scriora-docs/architecture/SCRIORA_AGENT_FRAMEWORK.md

const transport = new StdioServerTransport();
await server.connect(transport);

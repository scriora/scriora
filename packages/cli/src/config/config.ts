// CLI Configuration Manager
// Stores user credentials and preferences in ~/.scriora/config.json
// SECURITY: Never store API keys in env vars or .env files
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md
import Conf from 'conf';

interface ScrioraConfig {
  apiUrl: string;
  accessToken?: string;
  workspaceId?: string;
  workspaceName?: string;
}

export const config = new Conf<ScrioraConfig>({
  projectName: 'scriora',
  defaults: {
    apiUrl: process.env.SCRIORA_API_URL ?? 'https://api.scriora.com',
  },
});

export function isAuthenticated(): boolean {
  return Boolean(config.get('accessToken'));
}

export function requireAuth(): void {
  if (!isAuthenticated()) {
    throw new Error('NOT_AUTHENTICATED');
  }
}

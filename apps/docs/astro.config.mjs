import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'Scriora Documentation',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/scriora/scriora' }],
      sidebar: [
        {
          label: 'Getting Started',
          items: [{ autogenerate: { directory: 'getting-started' } }],
        },
        {
          label: 'Guides',
          items: [{ autogenerate: { directory: 'guides' } }],
        },
        {
          label: 'Agent Framework',
          items: [{ autogenerate: { directory: 'agent' } }],
        },
        {
          label: 'Social Adapters',
          items: [{ autogenerate: { directory: 'social' } }],
        },
        {
          label: 'MCP Integration',
          items: [{ autogenerate: { directory: 'mcp' } }],
        },
        {
          label: 'API Reference',
          items: [{ autogenerate: { directory: 'api-reference' } }],
        },
        {
          label: 'Self-Hosting',
          items: [{ autogenerate: { directory: 'self-hosting' } }],
        },
      ],
    }),
  ],
});

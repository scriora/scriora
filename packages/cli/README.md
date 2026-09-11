# scriora-cli

Developer CLI for Scriora  -  powered by Commander.js.

**Mandate:** Developer and power-user interface for Scriora.
Client only  -  holds zero server-side state.
Communicates exclusively with scriora-api via HTTP.

**Commands (Phase 1):**

| Command | Description |
|---|---|
| `scriora auth login` | Authenticate with Scriora |
| `scriora auth logout` | Clear stored credentials |
| `scriora auth whoami` | Show current user |
| `scriora workspace list` | List available workspaces |
| `scriora workspace switch <id>` | Switch active workspace |
| `scriora content create` | Create new content draft |
| `scriora content list` | List workspace content |
| `scriora social connect` | Connect a social account |
| `scriora social list` | List connected accounts |
| `scriora admin health-check` | Verify all services are running |
| `scriora admin migrate` | Run pending DB migrations |

**Security:**
- Credentials stored in `~/.scriora/config.json` (OS-managed permissions)
- Never stored in `.env` files or environment variables
- Token transmitted via Bearer header only

Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md

## Install

```bash
# From source
pnpm build
npm link

# Use
scriora --version
scriora auth login
```

## Quality Gate

```bash
pnpm typecheck && pnpm test && pnpm build
```

Coverage minimum: 75%

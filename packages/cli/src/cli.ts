// scriora-cli — Developer CLI Entry Point
// Mandate: Developer and power-user CLI tool for Scriora.
//          Client only — holds zero server-side state.
// INVARIANT: Credentials stored in ~/.scriora/config.json
//            NEVER in environment variables or plain text files.
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md
import { Command } from 'commander';

const program = new Command();

program.name('scriora').description('The Growth Operating System CLI').version('0.1.0');

// Commands will be registered here in Phase 1
// auth, workspace, content, social, admin

program.parse();

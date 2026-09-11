import fs from "node:fs";
import path from "node:path";

console.log("🔍 [Scriora Architecture Gate] Auditing module boundaries & security isolation...\n");

const ROOT = process.cwd();
let violations = 0;

function reportViolation(file, rule, details) {
  console.error("❌ [ARCHITECTURE / SECURITY VIOLATION]");
  console.error(`   File: ${file}`);
  console.error(`   Rule: ${rule}`);
  console.error(`   Details: ${details}\n`);
  violations++;
}

// 1. Audit apps/web: Must NEVER import database drivers or internal prisma clients directly
const webDir = path.join(ROOT, "apps", "web");
if (fs.existsSync(webDir)) {
  function scanWeb(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".next", "dist", ".turbo"].includes(entry.name)) {
          scanWeb(fullPath);
        }
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.includes("@prisma/client") || content.includes("from '@scriora/core/src/db'")) {
          reportViolation(
            path.relative(ROOT, fullPath),
            "Frontend DB Isolation",
            "apps/web must not import Prisma or direct DB client directly. All data must flow via API contracts."
          );
        }
      }
    }
  }
  scanWeb(webDir);
}

// 2. Audit all packages for inverted dependencies
const packagesDir = path.join(ROOT, "packages");
if (fs.existsSync(packagesDir)) {
  const pkgs = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const pkg of pkgs) {
    const pkgJsonPath = path.join(packagesDir, pkg, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      const allDeps = {
        ...pkgJson.dependencies,
        ...pkgJson.devDependencies,
      };
      for (const dep of Object.keys(allDeps)) {
        if (dep.startsWith("scriora-web") || dep.startsWith("scriora-api") || dep.startsWith("scriora-worker")) {
          reportViolation(
            path.relative(ROOT, pkgJsonPath),
            "Inverted Dependency",
            `Package '${pkg}' cannot depend on application '${dep}'. Dependencies must flow inwards.`
          );
        }
      }
    }
  }
}

// 3. Audit for hardcoded secrets, private keys, and high-entropy credentials
const secretPatterns = [
  { name: "Google API Key", pattern: /AIza[0-9A-Za-z-_]{35}/ },
  { name: "Stripe Secret Key", pattern: /(?:sk|rk)_live_[0-9a-zA-Z]{24}/ },
  { name: "GitHub Personal Token", pattern: /ghp_[0-9a-zA-Z]{36}/ },
  { name: "Slack Token", pattern: /xox[baprs]-[0-9a-zA-Z]{10,48}/ },
  { name: "Private Key Header", pattern: /-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----/ },
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
];

function scanSecrets(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".git", ".next", "dist", "build", ".turbo", "coverage"].includes(entry.name)) {
        scanSecrets(fullPath);
      }
    } else if (/\.(ts|tsx|js|mjs|json|yml|yaml|env)$/.test(entry.name) && !entry.name.endsWith(".lock") && !entry.name.endsWith(".example")) {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const { name, pattern } of secretPatterns) {
        if (pattern.test(content)) {
          reportViolation(
            path.relative(ROOT, fullPath),
            "Zero-Secrets Policy",
            `Potential secret detected (${name}). Never hardcode credentials in repository files.`
          );
        }
      }
    }
  }
}

scanSecrets(path.join(ROOT, "apps"));
scanSecrets(path.join(ROOT, "packages"));

if (violations > 0) {
  console.error(`\n💥 Architecture Gate failed with ${violations} violation(s).`);
  process.exit(1);
} else {
  console.log("\n✅ [Scriora Architecture Gate] All module boundaries and secret isolation rules passed cleanly.");
}

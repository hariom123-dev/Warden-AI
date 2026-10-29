import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { validateEnv } from '../config/env';

/**
 * Resolves the root workspace directory in a cross-platform manner.
 */
export function getWorkspaceRoot(): string {
  const cwd = path.resolve(process.cwd());
  // If run from backend directory, workspace root is parent
  if (fs.existsSync(path.join(cwd, 'package.json')) && !fs.existsSync(path.join(cwd, 'backend'))) {
    const parentDir = path.resolve(cwd, '..');
    if (fs.existsSync(path.join(parentDir, 'backend'))) {
      return parentDir;
    }
  }
  return cwd;
}

/**
 * Checks whether Git is installed and accessible in the system PATH.
 */
export function checkGit(): { ok: boolean; version?: string; error?: string } {
  try {
    const output = execSync('git --version', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
    return { ok: true, version: output };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: errorMsg };
  }
}

/**
 * Checks whether the Docker daemon is actively running.
 */
export function checkDocker(): { ok: boolean; error?: string } {
  try {
    execSync('docker info', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true,
    });
    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: errorMsg };
  }
}

/**
 * Verifies write access to the local workspace directory.
 */
export function checkWorkspaceWriteAccess(targetDir: string): { ok: boolean; error?: string } {
  const testFileName = `.warden-preflight-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const testFilePath = path.join(path.resolve(targetDir), testFileName);

  try {
    fs.writeFileSync(testFilePath, 'warden-healthcheck-write-test', { encoding: 'utf8' });
    fs.unlinkSync(testFilePath);
    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: errorMsg };
  }
}

/**
 * Runs the complete preflight healthcheck suite.
 */
export function runHealthcheck(exitOnFailure = true): boolean {
  console.log('\n==================================================================');
  console.log('  🛡️ Warden-AI Healthcheck Bootloader - Preflight Verification');
  console.log('==================================================================');

  let hasFatalError = false;
  const workspaceRoot = getWorkspaceRoot();

  // 1. Git Verification
  process.stdout.write('[Healthcheck] Checking Git CLI accessibility... ');
  const gitResult = checkGit();
  if (gitResult.ok) {
    console.log(`\x1b[32m✔ Accessible\x1b[0m (${gitResult.version})`);
  } else {
    hasFatalError = true;
    console.log('\x1b[31m❌ Missing\x1b[0m');
    console.error('\n\x1b[31m[ERROR] Git is not installed or not accessible in your system PATH.\x1b[0m');
    console.error('Git is required for repository operations and diff analysis.\n');
    console.error('\x1b[36mHow to resolve:\x1b[0m');
    console.error('  - Windows: Run "winget install --id Git.Git -e --source winget" or install from https://git-scm.com/download/win');
    console.error('  - macOS:   Run "xcode-select --install" or "brew install git"');
    console.error('  - Linux:   Run "sudo apt update && sudo apt install git" (Debian/Ubuntu) or "sudo dnf install git" (Fedora)\n');
  }

  // 2. Docker Daemon Verification (Warning only, non-fatal)
  process.stdout.write('[Healthcheck] Checking Docker daemon status... ');
  try {
    const dockerResult = checkDocker();
    if (dockerResult.ok) {
      console.log('\x1b[32m✔ Running\x1b[0m');
    } else {
      console.log('\x1b[33m⚠️ Not Running\x1b[0m');
      console.warn('\x1b[33m⚠️ Docker is not running. Please start Docker Desktop.\x1b[0m');
    }
  } catch {
    console.log('\x1b[33m⚠️ Not Running\x1b[0m');
    console.warn('\x1b[33m⚠️ Docker is not running. Please start Docker Desktop.\x1b[0m');
  }

  // 3. Workspace Write Access Verification
  process.stdout.write(`[Healthcheck] Checking workspace write permissions at [${workspaceRoot}]... `);
  const writeResult = checkWorkspaceWriteAccess(workspaceRoot);
  if (writeResult.ok) {
    console.log('\x1b[32m✔ Verified (Writable)\x1b[0m');
  } else {
    hasFatalError = true;
    console.log('\x1b[31m❌ Denied\x1b[0m');
    console.error(`\n\x1b[31m[ERROR] Write access denied to workspace: ${workspaceRoot}\x1b[0m`);
    console.error(`Underlying error: ${writeResult.error}\n`);
    console.error('\x1b[36mHow to resolve:\x1b[0m');
    console.error('  - Windows: Check folder permissions in Folder Properties -> Security, or run terminal with appropriate permissions.');
    console.error(`  - macOS/Linux: Run "chmod -R u+w '${workspaceRoot}'" or verify ownership.\n`);
  }

  // 4. Environment Variables Validation
  process.stdout.write('[Healthcheck] Validating environment configuration... ');
  const envResult = validateEnv(false);
  if (envResult.success) {
    console.log('\x1b[32m✔ Valid\x1b[0m');
  } else {
    hasFatalError = true;
    console.log('\x1b[31m❌ Invalid\x1b[0m');
  }

  console.log('------------------------------------------------------------------');

  if (hasFatalError) {
    console.error('\x1b[31m[Healthcheck] Preflight verification FAILED. Please resolve the issues above before starting.\x1b[0m\n');
    if (exitOnFailure) {
      process.exit(1);
    }
    return false;
  }

  console.log('\x1b[32m[Healthcheck] All preflight healthchecks passed! Proceeding to boot.\x1b[0m\n');
  return true;
}

// Execute immediately when run from the command line
if (require.main === module) {
  runHealthcheck(true);
}

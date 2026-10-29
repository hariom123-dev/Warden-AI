import fs from 'fs';
import path from 'path';
import { lockSessionInDb, isSessionLockedInDb, getAllLockedSessionsFromDb } from '../db/client';

export interface BreachIncident {
  id: string;
  agent_name: string;
  session_id: string;
  target_file: string;
  action_type: string;
  timestamp: string;
  reason: string;
}

const DECOY_FILENAME = '.env.decoy';

// Target directory for the honeypot: repository root or current working directory
const DEFAULT_HONEYPOT_DIR = path.resolve(process.cwd());
let activeDecoyPath: string | null = null;

// Registry of quarantined/blacklisted session IDs and agent identities
const lockedSessions = new Set<string>();

const CANARY_PAYLOAD = `# ==============================================================================
# CONFIDENTIAL PRODUCTION CONFIGURATION - DO NOT COMMIT
# (ACTIVE IDS CANARY - ACCESS TRIGGERS IMMEDIATE AUTOMATED REVOCATION)
# ==============================================================================
CANARY_TRAP_ID=warden-ids-honeypot-canary-vault-v1
AWS_MOCK_ACCESS_KEY=CANARY_AWS_MOCK_ACCESS_9918237
AWS_MOCK_SECRET_KEY=canary_mock_secret_do_not_use_wJalrXUtnFEMIK7M
DATABASE_URL=postgres://canary_admin:HoneypotSecretPass992@prod-db.internal.warden.ai:5432/core_production
API_GATEWAY_TOKEN=mock_sandbox_canary_key_warden_ids_992182
INTERNAL_SIGNING_SECRET=warden-ids-decoy-token-sig-7f9a12b4e6c
JWT_SECRET=super-canary-jwt-token-vault-9918237192
`;

/**
 * Initializes the decoy honeypot file on proxy startup.
 */
export function initHoneypot(targetDir = DEFAULT_HONEYPOT_DIR): string {
  try {
    const decoyPath = path.join(targetDir, DECOY_FILENAME);
    fs.writeFileSync(decoyPath, CANARY_PAYLOAD, { encoding: 'utf8', mode: 0o600 });
    activeDecoyPath = decoyPath;

    console.log(`[Warden-IDS] Cryptographic Decoy Honeypot armed at: ${decoyPath}`);

    // Register process exit clean-up handlers
    registerCleanupHandlers();

    return decoyPath;
  } catch (error) {
    console.error('[Warden-IDS] Failed to arm honeypot decoy:', error);
    return '';
  }
}

/**
 * Removes the decoy file gracefully.
 */
export function cleanupHoneypot(): void {
  if (activeDecoyPath && fs.existsSync(activeDecoyPath)) {
    try {
      fs.unlinkSync(activeDecoyPath);
      console.log(`[Warden-IDS] Cleaned up decoy honeypot file: ${activeDecoyPath}`);
    } catch {
      // Best effort cleanup on shutdown
    }
    activeDecoyPath = null;
  }
}

let cleanupRegistered = false;
function registerCleanupHandlers(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  process.on('exit', () => cleanupHoneypot());
  process.on('SIGINT', () => {
    cleanupHoneypot();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanupHoneypot();
    process.exit(0);
  });
}

/**
 * Determines whether a file path or command string references the decoy honeypot.
 */
export function isHoneypotAccess(filePathOrCommand: string): boolean {
  if (!filePathOrCommand) return false;
  const normalized = filePathOrCommand.toLowerCase().replace(/\\/g, '/');
  return (
    normalized.includes('.env.decoy') ||
    normalized.includes('env.decoy') ||
    (activeDecoyPath !== null && normalized.includes(path.basename(activeDecoyPath).toLowerCase()))
  );
}

/**
 * Checks if a session or agent is locked out due to prior intrusion breach.
 */
export function isSessionLocked(sessionIdOrAgent: string): boolean {
  return lockedSessions.has(sessionIdOrAgent) || isSessionLockedInDb(sessionIdOrAgent);
}

/**
 * Locks and revokes all execution rights for the given session ID or agent.
 */
export function lockSession(sessionIdOrAgent: string, reason = 'Intrusion honeypot (.env.decoy) triggered'): void {
  lockedSessions.add(sessionIdOrAgent);
  try {
    lockSessionInDb(sessionIdOrAgent, reason);
  } catch (err) {
    console.error('[Warden-IDS] Failed to write locked session to SQLite:', err);
  }
  console.error(`[Warden-IDS] PERMANENT LOCKOUT: Session/Agent "${sessionIdOrAgent}" quarantined in SQLite.`);
}

/**
 * Returns all currently quarantined sessions.
 */
export function getQuarantinedSessions(): string[] {
  const dbSessions = getAllLockedSessionsFromDb();
  const allSessions = new Set([...Array.from(lockedSessions), ...dbSessions]);
  return Array.from(allSessions);
}

import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export type AuditLogStatus = 'pending' | 'approved' | 'rejected';

export interface AuditLog {
  id: string;
  timestamp: string;
  agent_name: string;
  action_type: string;
  payload: string;
  status: AuditLogStatus;
}

export const DB_PATH = path.resolve(
  env?.DB_PATH || process.env.DB_PATH || path.join(__dirname, '../../audit.db')
);

// Ensure database parent directory exists cross-platform
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Dual SQLite runtime adapter: uses better-sqlite3 when present, with built-in node:sqlite fallback
let dbInstance: any;
try {
  const BetterSqlite3 = require('better-sqlite3');
  dbInstance = new BetterSqlite3(DB_PATH);
} catch {
  try {
    const { DatabaseSync } = require('node:sqlite');
    dbInstance = new DatabaseSync(DB_PATH);
  } catch (sqliteErr) {
    console.error(`\x1b[31m[Warden-AI DB] ❌ Failed to open SQLite database at: ${DB_PATH}\x1b[0m`);
    console.error('Please ensure the path is writable and your Node version supports SQLite (Node 18+).\n');
    throw sqliteErr;
  }
}

export const db: any = dbInstance;

export function initDatabase(): void {
  if (typeof db.pragma === 'function') {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  } else {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      agent_name TEXT,
      action_type TEXT,
      payload TEXT,
      status TEXT -- 'pending', 'approved', 'rejected'
    );

    CREATE TABLE IF NOT EXISTS locked_sessions (
      session_id TEXT PRIMARY KEY,
      reason TEXT,
      locked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function lockSessionInDb(sessionId: string, reason = 'Intrusion honeypot triggered'): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO locked_sessions (session_id, reason, locked_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(sessionId, reason);
}

export function isSessionLockedInDb(sessionId: string): boolean {
  try {
    const stmt = db.prepare(`
      SELECT session_id FROM locked_sessions WHERE session_id = ?
    `);
    const row = stmt.get(sessionId);
    return !!row;
  } catch {
    return false;
  }
}

export function getAllLockedSessionsFromDb(): string[] {
  try {
    const stmt = db.prepare(`
      SELECT session_id FROM locked_sessions ORDER BY locked_at DESC
    `);
    const rows = stmt.all() as { session_id: string }[];
    return rows.map((r) => r.session_id);
  } catch {
    return [];
  }
}

export function insertAuditLog(
  id: string,
  agentName: string,
  actionType: string,
  payload: string,
  status: AuditLogStatus = 'pending'
): void {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (id, agent_name, action_type, payload, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, agentName, actionType, payload, status);
}

export function updateAuditLogStatus(id: string, status: AuditLogStatus): boolean {
  const stmt = db.prepare(`
    UPDATE audit_logs
    SET status = ?
    WHERE id = ?
  `);
  const result = stmt.run(status, id);
  return result.changes > 0;
}

export function getAuditLogById(id: string): AuditLog | undefined {
  const stmt = db.prepare(`
    SELECT id, timestamp, agent_name, action_type, payload, status
    FROM audit_logs
    WHERE id = ?
  `);
  return stmt.get(id) as AuditLog | undefined;
}

export function getAllAuditLogs(limit = 100): AuditLog[] {
  const stmt = db.prepare(`
    SELECT id, timestamp, agent_name, action_type, payload, status
    FROM audit_logs
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as AuditLog[];
}

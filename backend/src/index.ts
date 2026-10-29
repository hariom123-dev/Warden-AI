// 1. Validate environment configuration before any other subsystems boot
import { env } from './config/env';

import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import { initDatabase, getAllAuditLogs, getAuditLogById, DB_PATH } from './db/client';
import { initWebSocketServer } from './ws/socket';
import mcpRouter from './routes/mcp';
import { initHoneypot, getQuarantinedSessions } from './security/honeypot';

const app = express();
const server = http.createServer(app);

const PORT = env.PORT;

// Middleware
app.use(cors(env.CORS_ORIGIN === '*' ? undefined : { origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));

// Database Initialization on startup
initDatabase();

// Arm Cryptographic Decoy Honeypot IDS if enabled
if (env.HONEYPOT_ENABLED) {
  initHoneypot();
}

// Initialize WebSocket Control Stream on HTTP Server
const wss = initWebSocketServer(server);

// Mount MCP Proxy Interceptor Router
app.use('/api/mcp', mcpRouter);

// Honeypot & Quarantine Status endpoint
app.get('/api/ids/status', (_req: Request, res: Response) => {
  res.status(200).json({
    status: env.HONEYPOT_ENABLED ? 'armed' : 'disabled',
    honeypot_file: '.env.decoy',
    quarantined_sessions: getQuarantinedSessions()
  });
});

// Health & System Info
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'Strict-Control AI Harness - AI Security Gateway',
    timestamp: new Date().toISOString()
  });
});

// Audit Logs API for Dashboard
app.get('/api/audit-logs', (_req: Request, res: Response) => {
  try {
    const logs = getAllAuditLogs(100);
    res.status(200).json({ success: true, count: logs.length, data: logs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error'
    });
  }
});

app.get('/api/audit-logs/:id', (req: Request, res: Response) => {
  try {
    const log = getAuditLogById(req.params.id);
    if (!log) {
      res.status(404).json({ success: false, error: 'Audit log not found' });
      return;
    }
    res.status(200).json({ success: true, data: log });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error'
    });
  }
});

// Export server, app, and wss
export { app, server, wss };

// Only listen directly if run as main entrypoint
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[AI-Security-Gateway] Reverse proxy backend listening on port ${PORT}`);
    console.log(`[AI-Security-Gateway] WebSocket control stream mounted.`);
    console.log(`[AI-Security-Gateway] SQLite audit trail initialized at ${DB_PATH}.`);
  });
}

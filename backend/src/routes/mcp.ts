import path from 'path';
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { insertAuditLog } from '../db/client';
import { broadcast, broadcastCriticalBreach, terminateAllConnections } from '../ws/socket';
import { isHoneypotAccess, isSessionLocked, lockSession } from '../security/honeypot';

export interface PendingRequestHolder {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

// Global in-memory Map holding unresolved HTTP requests
export const pendingRequests = new Map<string, PendingRequestHolder>();

const router = Router();

async function handleMcpIntercept(req: Request, res: Response): Promise<void> {
  const id = uuidv4();
  const agentName = req.body.agent_name || req.body.agentName || 'autonomous-agent';
  const sessionId = req.body.session_id || req.body.sessionId || agentName;
  const actionType = req.body.action_type || req.body.actionType || req.body.params?.name || req.body.tool || 'mcp_tool_call';
  const payloadData = req.body.payload !== undefined ? req.body.payload : req.body;
  const payloadString = typeof payloadData === 'string' ? payloadData : JSON.stringify(payloadData, null, 2);

  // Extract and normalize candidate file paths or targets across platforms
  const rawPath =
    req.body.params?.arguments?.path ||
    req.body.params?.arguments?.file ||
    req.body.path ||
    req.body.file ||
    '';
  const candidatePath = typeof rawPath === 'string' && rawPath.trim() !== '' ? path.normalize(rawPath) : '';

  // 1. Session Quarantine Check: Is this session already locked?
  if (isSessionLocked(sessionId)) {
    console.warn(`[Warden-IDS] Blocked attempt by quarantined session: "${sessionId}"`);
    res.status(403).json({
      status: 'quarantined',
      decision: 'rejected',
      error: 'SECURITY_LOCKOUT: Session has been permanently revoked due to an intrusion detection breach.'
    });
    return;
  }

  // 2. Active Honeypot Breach Check: Does this action attempt to access .env.decoy?
  const isBreach = isHoneypotAccess(candidatePath) || isHoneypotAccess(payloadString);

  if (isBreach) {
    console.error(`[Warden-IDS] CRITICAL BREACH: Agent "${agentName}" (Session: ${sessionId}) attempted access to Decoy Honeypot!`);

    // A. Lock all further execution rights for this session ID
    lockSession(sessionId);

    // B. Record critical security violation in SQLite audit trail
    insertAuditLog(id, agentName, `IDS_BREACH_HONEYPOT_${actionType}`, payloadString, 'rejected');

    // C. Dispatch CRITICAL_BREACH event to the dashboard
    const breachEvent = {
      id,
      severity: 'CRITICAL',
      agent_name: agentName,
      session_id: sessionId,
      target_file: candidatePath || '.env.decoy',
      action_type: actionType,
      reason: 'Unauthorized access to Cryptographic Decoy Honeypot (.env.decoy) detected',
      timestamp: new Date().toISOString()
    };
    broadcastCriticalBreach(breachEvent);

    // D. Terminate WebSocket connections to frontend / clients
    setTimeout(() => {
      terminateAllConnections('CRITICAL_BREACH: Intrusion Honeypot Triggered');
    }, 500);

    // E. Immediately block and terminate the HTTP request
    res.status(403).json({
      status: 'breach_detected',
      decision: 'quarantined',
      id,
      error: 'CRITICAL_SECURITY_VIOLATION: Access to decoy honeypot asset intercepted. All session execution rights have been revoked.'
    });
    return;
  }

  // 3. Normal Flow: Standard Zero-Trust Async Hold
  // Save to SQLite with status 'pending'
  insertAuditLog(id, agentName, actionType, payloadString, 'pending');

  // Emit WebSocket event to React frontend with UUID and payload
  const requestEvent = {
    type: 'NEW_PENDING_REQUEST',
    id,
    agent_name: agentName,
    action_type: actionType,
    payload: payloadString,
    status: 'pending',
    timestamp: new Date().toISOString()
  };
  broadcast(requestEvent);

  console.log(`[Proxy-Interceptor] Intercepted MCP call [${id}] from agent "${agentName}" (${actionType}). Holding request.`);

  // Return Promise and store resolve/reject callbacks in the Map
  try {
    const resolvedData = await new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
    });

    console.log(`[Proxy-Interceptor] MCP call [${id}] approved by human operator.`);
    res.status(200).json({
      status: 'success',
      decision: 'approved',
      id,
      data: resolvedData
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Execution rejected by human operator';
    console.warn(`[Proxy-Interceptor] MCP call [${id}] rejected by human operator: ${errorMsg}`);
    res.status(403).json({
      status: 'forbidden',
      decision: 'rejected',
      id,
      error: errorMsg
    });
  }
}

// Support both /api/mcp and /api/mcp/execute
router.post('/execute', handleMcpIntercept);
router.post('/', handleMcpIntercept);

// Health check / inspection for pending requests
router.get('/pending', (_req: Request, res: Response) => {
  const ids = Array.from(pendingRequests.keys());
  res.status(200).json({
    success: true,
    pendingCount: ids.length,
    pendingIds: ids
  });
});

export default router;

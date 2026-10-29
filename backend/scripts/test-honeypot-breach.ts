import path from 'path';

/**
 * Mock Autonomous AI Agent - Honeypot Intrusion Test
 *
 * Demonstrates the Warden-AI Intrusion Detection System (IDS):
 * Simulates an autonomous agent attempting to read the decoy asset (.env.decoy).
 * The proxy immediately blocks the request with 403 Forbidden, permanently revokes
 * session execution rights, and triggers the full-screen lockdown modal on the dashboard.
 */

const TARGET_PORT = process.env.PORT || 3001;
const PROXY_URL = `http://localhost:${TARGET_PORT}/api/mcp/execute`;

const decoyPath = path.normalize('.env.decoy');
const safeDir = path.normalize('src');

const breachPayload = {
  jsonrpc: "2.0",
  id: 42,
  method: "tools/call",
  agent_name: "Rogue-Claude-Collector",
  session_id: "rogue-session-007",
  action_type: "read_file",
  params: {
    name: "read_file",
    arguments: {
      path: decoyPath
    }
  }
};

async function testHoneypotBreach() {
  console.log("==================================================================");
  console.log("  Warden-AI Intrusion Detection System (IDS) - Honeypot Test");
  console.log("==================================================================");
  console.log(`[Rogue Agent] Target Endpoint: ${PROXY_URL}`);
  console.log(`[Rogue Agent] Identity: "${breachPayload.agent_name}"`);
  console.log(`[Rogue Agent] Session ID: "${breachPayload.session_id}"`);
  console.log(`[Rogue Agent] Attempting to read: "${breachPayload.params.arguments.path}"`);
  console.log("------------------------------------------------------------------");

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(breachPayload)
    });

    console.log(`[Gateway Response Status]: ${response.status} ${response.statusText}`);
    const data = await response.json();
    console.log("[Gateway Response Body]:");
    console.log(JSON.stringify(data, null, 2));

    if (response.status === 403 && data.status === "breach_detected") {
      console.log("\n>>> SUCCESS: Honeypot triggered! Request terminated with 403 Forbidden. <<<");
      console.log(">>> Check the React Dashboard: Red full-screen lockdown modal is active! <<<");
    }

    // Now test session lockout by attempting a benign action
    console.log("\n------------------------------------------------------------------");
    console.log("[Rogue Agent] Attempting secondary benign action after lockout...");
    const retryResponse = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...breachPayload,
        action_type: "list_directory",
        params: { name: "list_dir", arguments: { path: safeDir } }
      })
    });

    console.log(`[Secondary Response Status]: ${retryResponse.status} ${retryResponse.statusText}`);
    const retryData = await retryResponse.json();
    console.log(JSON.stringify(retryData, null, 2));
    if (retryData.status === "quarantined") {
      console.log("\n>>> SUCCESS: Session permanently quarantined from further execution! <<<");
    }
  } catch (err) {
    console.error("[Test Error]:", err);
  }
}

testHoneypotBreach();

import path from 'path';

/**
 * Mock Autonomous AI Agent (MCP Tool Call Simulator)
 *
 * Demonstrates the Strict-Control AI Harness reverse proxy holding
 * an HTTP request open indefinitely until the human operator approves or rejects
 * the tool call in the React security dashboard.
 */

const TARGET_PORT = process.env.PORT || 3001;
const PROXY_URL = `http://localhost:${TARGET_PORT}/api/mcp/execute`;

const targetFilePath = path.join('src', 'core', 'auth.ts');

const mcpPayload = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  agent_name: "Mock-Claude-Agent",
  action_type: "write_file",
  params: {
    name: "write_file",
    arguments: {
      path: targetFilePath,
      content: "// AI injected code attempting to bypass auth\nexport const bypass = true;",
      old_content: "// Production Auth Policy\nexport const requireAuth = true;\nexport const bypass = false;",
      new_content: "// Production Auth Policy\nexport const requireAuth = false;\nexport const bypass = true;"
    }
  }
};

async function runMockAgent() {
  console.log("==================================================================");
  console.log("  Strict-Control AI Harness - Zero-Trust Agent Simulator");
  console.log("==================================================================");
  console.log(`[Mock Agent] Target Endpoint: ${PROXY_URL}`);
  console.log(`[Mock Agent] Agent Identity: "${mcpPayload.agent_name}"`);
  console.log(`[Mock Agent] Action Type:   "${mcpPayload.action_type}"`);
  console.log(`[Mock Agent] Target File:   "${mcpPayload.params.arguments.path}"`);
  console.log("------------------------------------------------------------------");
  console.log("[Mock Agent] Dispatching intercepted MCP tool call to proxy...");
  console.log("[Mock Agent] STATUS: WAITING FOR HUMAN OPERATOR APPROVAL IN DASHBOARD.");
  console.log("[Mock Agent] (Notice: This terminal process is actively HELD OPEN by the proxy)");
  console.log("------------------------------------------------------------------");

  const timerLabel = "Agent Execution Hold Duration";
  console.time(timerLabel);

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(mcpPayload)
    });

    console.log("\n------------------------------------------------------------------");
    console.timeEnd(timerLabel);
    console.log("------------------------------------------------------------------");
    console.log(`[Mock Agent] HTTP Status Code: ${response.status} ${response.statusText}`);

    const result = await response.json();
    console.log("[Mock Agent] Gateway Response Body:");
    console.log(JSON.stringify(result, null, 2));

    if (response.ok) {
      console.log("\n[RESULT] >>> ACTION APPROVED! Autonomous agent unblocked to continue execution. <<<");
    } else {
      console.log("\n[RESULT] >>> ACTION REJECTED! Autonomous agent received 403 Forbidden. Safe zero-trust enforcement. <<<");
    }
  } catch (error) {
    console.error("\n[Mock Agent] Network or Gateway Error:", error);
  }
}

runMockAgent();

import http from "node:http";

const SID = "trial-session";

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "localhost", port: 3000, path, method,
      headers: { "Content-Type": "application/json", "x-session-id": SID },
    };
    const r = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  // Get current context
  const initial = await req("GET", "/api/context");
  const ctxJSON = initial.data;

  // Add a user message
  ctxJSON.messages.push({ role: "user", content: "list the contents of ./src" });

  console.log("=== 1. Set tools + send message via PUT /api/contexts ===");

  // PUT /api/contexts with the new context — server auto-processes
  const putRes = await req("PUT", "/api/contexts", {
    contexts: [ctxJSON],
    activeCtx: 0,
  });
  console.log("PUT status:", putRes.status);
  console.log("contexts count:", putRes.data.contexts?.length ?? 0);
  console.log("autoExecuted:", putRes.data.autoExecuted ?? "N/A");

  const msgs = putRes.data.contexts?.[0]?.messages ?? [];
  console.log("message count:", msgs.length);
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const preview =
      m.role === "assistant" && m.tool_calls?.length
        ? `[tool_calls: ${m.tool_calls.map((t) => t.function.name).join(", ")}]`
        : m.role === "tool"
        ? `[tool_result for ${m.tool_call_id}] ${(m.content || "").slice(0, 60)}`
        : (m.content || "").slice(0, 100);
    console.log(`  [${i}] ${m.role}: ${preview}`);
  }

  console.log("\n=== 2. Execute pending (if any) ===");
  const exec = await req("POST", "/api/context/execute");
  console.log("executed:", exec.data.executed);
}

main().catch(console.error);

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
  console.log("=== 1. Set tools (list_directory) ===");
  await req("PUT", "/api/context/tools", {
    tools: [
      {
        type: "function",
        function: {
          name: "list_directory",
          description: "List all filenames in a given directory path.",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      },
    ],
  });
  const ctx = await req("GET", "/api/context");
  console.log("tools set:", ctx.data.tools?.length, "tool(s)");

  console.log("\n=== 2. Send message: 'list the contents of ./src' ===");
  const chat1 = await req("POST", "/api/chat", {
    message: "list the contents of ./src",
    model: "deepseek-v4-flash",
  });
  console.log("reply:", chat1.data.reply?.slice(0, 100) || "(null)");
  console.log("tool_calls:", chat1.data.tool_calls?.length || 0);

  if (chat1.data.tool_calls?.length > 0) {
    const tc = chat1.data.tool_calls[0];
    console.log("  → name:", tc.function.name);
    console.log("  → args:", tc.function.arguments);
  }

  console.log("\n=== 3. Execute pending tools ===");
  const exec = await req("POST", "/api/context/execute");
  console.log("executed:", exec.data.executed);

  console.log("\n=== 4. Check context (tool result present) ===");
  const ctx2 = await req("GET", "/api/context");
  const msgs = ctx2.data.messages;
  console.log("message count:", msgs.length);
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const preview =
      m.role === "assistant" && m.tool_calls?.length
        ? `[tool_calls: ${m.tool_calls.map((t) => t.function.name).join(", ")}]`
        : m.role === "tool"
        ? `[tool_result for ${m.tool_call_id}] ${(m.content || "").slice(0, 60)}`
        : (m.content || "").slice(0, 60);
    console.log(`  [${i}] ${m.role}: ${preview}`);
  }

  console.log("\n=== 5. Follow-up: 'what did you find?' ===");
  const chat2 = await req("POST", "/api/chat", {
    message: "what did you find? summarize the directory contents",
    model: "deepseek-v4-flash",
  });
  console.log("reply:", chat2.data.reply?.slice(0, 300) || "(null)");
  console.log("tool_calls:", chat2.data.tool_calls?.length || 0);
}

main().catch(console.error);

/**
 * SSE 流消费工具。
 * 从 fetch Response 中读取 text/event-stream，逐事件调用 handler。
 *
 * 用法:
 *   const reader = readSSE(response);
 *   reader.on("token", data => console.log(data.token));
 *   reader.on("done", data => console.log("完成", data.contexts));
 *   reader.on("error", data => console.error(data.message));
 *   await reader.done;  // 等待流结束
 */

export function readSSE(response) {
  const handlers = {};
  let onEvent = null; // fallback for events without explicit handler

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const donePromise = new Promise((resolve, reject) => {
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";

          for (const part of parts) {
            const event = parseSSEEvent(part);
            if (!event) continue;
            const fn = handlers[event.type] || onEvent;
            if (fn) fn(event.data);
          }
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    })();
  });

  return {
    on(type, fn) {
      handlers[type] = fn;
      return this;
    },
    onEvent(fn) {
      onEvent = fn;
      return this;
    },
    get done() { return donePromise; },
  };
}

function parseSSEEvent(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  let eventType = "message"; // default event type
  let data = null;

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      const payload = line.slice(5).trim();
      try { data = JSON.parse(payload); } catch { data = payload; }
    }
  }

  if (data === null) return null;
  return { type: eventType, data };
}

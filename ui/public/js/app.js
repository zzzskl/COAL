import { initConfig } from "./config.js";
import { initChat } from "./chat.js";
import { initContextBuilder } from "./context.js";
import { initTools } from "./tools.js";
import { initExecutor } from "./executor.js";
import { initLogs } from "./logs.js";

// Shared state
let sessionId = localStorage.getItem("coal-session");
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("coal-session", sessionId);
}

let userName = localStorage.getItem("coal-user") || "default";

window.COAL = {
  headers() {
    return {
      "Content-Type": "application/json",
      "x-session-id": sessionId,
      "x-user": userName,
    };
  },
};

// === Responsive sidebar toggle ===
const hamburger = document.getElementById("hamburger-btn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebar-overlay");

function openSidebar() {
  document.body.classList.add("sidebar-open");
  hamburger.setAttribute("aria-expanded", "true");
}
function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  hamburger.setAttribute("aria-expanded", "false");
}

hamburger.addEventListener("click", () => {
  document.body.classList.contains("sidebar-open") ? closeSidebar() : openSidebar();
});
overlay.addEventListener("click", closeSidebar);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("sidebar-open")) {
    closeSidebar();
  }
});

// === Accordion section toggle ===
document.querySelectorAll(".section-header").forEach((header) => {
  header.addEventListener("click", () => {
    const section = header.dataset.section;
    const content = document.getElementById(`section-${section}`);
    const isCollapsed = header.classList.toggle("collapsed");
    content.classList.toggle("collapsed", isCollapsed);
  });
});

// === Scroll-to-bottom button ===
const messagesEl = document.getElementById("messages");
const scrollBottomBtn = document.getElementById("scroll-bottom-btn");

messagesEl.addEventListener("scroll", () => {
  const dist = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
  if (dist > 200) {
    scrollBottomBtn.classList.add("visible");
  } else {
    scrollBottomBtn.classList.remove("visible");
  }
});

scrollBottomBtn.addEventListener("click", () => {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
});

// Init components
const tools = initTools();
const config = initConfig(refreshAll);
const chat = initChat(refreshAll, config.getConfig);
const ctxBuilder = initContextBuilder(refreshAll);
const executor = initExecutor(refreshAll);
const logs = initLogs();

// === User switching ===
const userNameInput = document.getElementById("user-name");
userNameInput.value = userName;

userNameInput.addEventListener("change", async () => {
  const newUser = userNameInput.value.trim() || "default";
  if (newUser === userName) return;
  userName = newUser;
  localStorage.setItem("coal-user", userName);
  // Tell server to switch user
  await fetch("/api/user/switch", {
    method: "POST",
    headers: window.COAL.headers(),
    body: JSON.stringify({ user: userName }),
  });
  await refreshAll();
});

async function refreshAll() {
  const res = await fetch("/api/context", {
    headers: window.COAL.headers(),
  });
  const data = await res.json();
  chat.renderMessages(data.messages);
  ctxBuilder.renderCtxList(data.messages);
  const sysMsg = data.messages.find((m) => m.role === "system");
  config.setSystemPrompt(sysMsg ? sysMsg.content : "");
  tools.loadTools(data.tools);
  await config.loadConfig();
  await logs.refreshLogs();
}

// Load initial state
refreshAll();

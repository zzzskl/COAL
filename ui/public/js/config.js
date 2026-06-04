const $ = (sel) => document.querySelector(sel);

export function initConfig(refreshAll) {
  const cfgModel = $("#cfg-model");
  const cfgSystem = $("#cfg-system");
  const cfgTemperature = $("#cfg-temperature");
  const cfgMaxTokens = $("#cfg-maxTokens");
  const cfgTopP = $("#cfg-topP");
  const cfgThinkingToggle = $("#cfg-thinking-toggle");
  const cfgThinkingEffort = $("#cfg-thinking-effort");
  const cfgStop = $("#cfg-stop");

  cfgTemperature.addEventListener("input", () => {
    $("#val-temp").textContent = cfgTemperature.value;
  });
  cfgTopP.addEventListener("input", () => {
    $("#val-topP").textContent = cfgTopP.value;
  });
  cfgThinkingToggle.addEventListener("change", () => {
    cfgThinkingEffort.style.display = cfgThinkingToggle.checked ? "" : "none";
  });

  cfgSystem.addEventListener("blur", async () => {
    await fetch("/api/context/system", {
      method: "POST",
      headers: window.COAL.headers(),
      body: JSON.stringify({ content: cfgSystem.value.trim() || undefined }),
    });
    await refreshAll();
  });

  // ── config → server sync on every change ──

  async function saveConfigToServer() {
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: window.COAL.headers(),
        body: JSON.stringify(getConfig()),
      });
    } catch (_) { /* silent */ }
  }

  cfgModel.addEventListener("change", saveConfigToServer);
  cfgTemperature.addEventListener("change", saveConfigToServer);
  cfgMaxTokens.addEventListener("change", saveConfigToServer);
  cfgTopP.addEventListener("change", saveConfigToServer);
  cfgThinkingToggle.addEventListener("change", saveConfigToServer);
  cfgThinkingEffort.addEventListener("change", saveConfigToServer);
  cfgStop.addEventListener("change", saveConfigToServer);
  // auto-execute toggle (in executor section)
  const autoExecToggle = $("#auto-exec-toggle");
  if (autoExecToggle) {
    autoExecToggle.addEventListener("change", saveConfigToServer);
  }

  // ── public API ──

  function getConfig() {
    return {
      model: cfgModel.value,
      temperature: parseFloat(cfgTemperature.value),
      maxTokens: parseInt(cfgMaxTokens.value),
      topP: parseFloat(cfgTopP.value),
      thinking: cfgThinkingToggle.checked
        ? { effort: cfgThinkingEffort.value }
        : "disabled",
      stop: (() => {
        const raw = cfgStop.value.trim();
        if (!raw) return undefined;
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
      })(),
      autoExecute: autoExecToggle?.checked ?? false,
    };
  }

  function setConfig(cfg) {
    if (cfg.model !== undefined) cfgModel.value = cfg.model;
    if (cfg.temperature !== undefined) {
      cfgTemperature.value = cfg.temperature;
      $("#val-temp").textContent = cfg.temperature;
    }
    if (cfg.maxTokens !== undefined) cfgMaxTokens.value = cfg.maxTokens;
    if (cfg.topP !== undefined) {
      cfgTopP.value = cfg.topP;
      $("#val-topP").textContent = cfg.topP;
    }
    if (cfg.thinking !== undefined) {
      if (cfg.thinking === "disabled") {
        cfgThinkingToggle.checked = false;
        cfgThinkingEffort.style.display = "none";
      } else if (cfg.thinking?.effort) {
        cfgThinkingToggle.checked = true;
        cfgThinkingEffort.value = cfg.thinking.effort;
        cfgThinkingEffort.style.display = "";
      }
    }
    if (cfg.stop !== undefined) {
      cfgStop.value = Array.isArray(cfg.stop) ? cfg.stop.join(", ") : "";
    }
    if (cfg.autoExecute !== undefined && autoExecToggle) {
      autoExecToggle.checked = cfg.autoExecute;
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch("/api/config", { headers: window.COAL.headers() });
      if (res.ok) {
        const cfg = await res.json();
        setConfig(cfg);
      }
    } catch (_) { /* silent */ }
  }

  function setSystemPrompt(content) {
    cfgSystem.value = content ?? "";
  }

  return { getConfig, setConfig, loadConfig, setSystemPrompt };
}

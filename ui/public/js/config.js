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

  return {
    getConfig() {
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
      };
    },
    setSystemPrompt(content) {
      cfgSystem.value = content ?? "";
    },
  };
}

// sb-context.js — Sidebar Context Builder section
// Thin adapter: creates ContextBuilder bound to app state

import { ContextBuilder } from "./context.js";

function app() { return window.__COAL_APP__; }

export function initContextBuilder(refreshAll) {
  const ctxList = document.getElementById("ctx-list");

  function renderBuilder() {
    const a = app();
    const ctx = a.getActiveContext();
    if (!ctx) { ctxList.innerHTML = '<div style="padding:8px;color:var(--c-text-dim);font-size:12px">No context</div>'; return; }

    const collapsed = a.state.ui?.collapsed?.[a.state.activeCtx] ?? [];
    const name = a.state.ui?.context?.[a.state.activeCtx]?.name;

    const builder = ContextBuilder(ctx, {
      collapsed,
      name,
      onChange: (extra) => {
        // Update name
        if (extra?.name && a.state.ui) {
          if (!a.state.ui.context) a.state.ui.context = {};
          a.state.ui.context[a.state.activeCtx] = { name: extra.name };
          a.api("PUT", "/api/context/name", { name: extra.name }).catch(() => {});
        }
        // Update collapsed
        if (extra?.collapsed && a.state.ui) {
          a.state.ui.collapsed[a.state.activeCtx] = extra.collapsed;
          a.api("PUT", "/api/ui", { collapsed: a.state.ui.collapsed }).catch(() => {});
        }
        a.syncContexts().then(refreshAll).catch(refreshAll);
      },
    });
    ctxList.innerHTML = "";
    ctxList.appendChild(builder);
  }

  renderBuilder();

  const a = app();
  a.refreshSidebar = renderBuilder;

  return { refresh: renderBuilder };
}

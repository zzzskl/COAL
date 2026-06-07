// ctx-panel.js — Standalone Context Builder panel
import { ContextBuilder } from "./context.js";

export function ContextBuilderPanel(ctx, opts = {}) {
  const { collapsed, name, onChange } = opts;
  const el = document.createElement("div");
  el.className = "ctx-panel";

  const builder = ContextBuilder(ctx, { collapsed, name, onChange });
  el.appendChild(builder);

  return { el };
}

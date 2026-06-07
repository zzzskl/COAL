#!/usr/bin/env bash
# test-api.sh — COAL API curl 参考 / 冒烟测试
# 用法: bash scripts/test-api.sh

set -e

BASE="http://localhost:3000"
SID="test-$(date +%s)"
H="x-session-id: $SID"
CT="Content-Type: application/json"
PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  PASS: $label"
    ((PASS++)) || true
  else
    echo "  FAIL: $label — expected '$expected', got: $(echo "$actual" | head -c 200)"
    ((FAIL++)) || true
  fi
}

echo "=== COAL API Smoke Test ==="
echo "Session: $SID"
echo ""

# ── 1. Configuration ──────────────────────────────────────────────
echo "── 1. Configuration ──"

# 1a. Read default config
CONFIG=$(curl -sf "$BASE/api/config" -H "$H")
check "GET /api/config returns object" "{" "$CONFIG"

# 1b. Set config
RES=$(curl -sf -X PUT "$BASE/api/config" -H "$H" -H "$CT" \
  -d '{"model":"deepseek-v4-flash","temperature":0.3,"autoExecute":false}')
check "PUT /api/config sets model" "deepseek-v4-flash" "$RES"
check "PUT /api/config sets temperature" "0.3" "$RES"
check "PUT /api/config sets autoExecute" "false" "$RES"

# 1c. Verify config persisted
CONFIG2=$(curl -sf "$BASE/api/config" -H "$H")
check "GET /api/config reflects update" "deepseek-v4-flash" "$CONFIG2"

# ── 2. Context management ─────────────────────────────────────────
echo "── 2. Context management ──"

# 2a. Clear context
RES=$(curl -sf -X DELETE "$BASE/api/context" -H "$H")
check "DELETE /api/context clears" '"messages"' "$RES"

# 2b. Set system prompt
RES=$(curl -sf -X POST "$BASE/api/context/system" -H "$H" -H "$CT" \
  -d '{"content":"You are a helpful assistant."}')
check "POST /api/context/system sets prompt" "system" "$RES"

# 2c. Add user message
RES=$(curl -sf -X POST "$BASE/api/context/message" -H "$H" -H "$CT" \
  -d '{"role":"user","content":"What is 2+2?"}')
check "POST /api/context/message adds" "user" "$RES"

# 2d. Edit message at index
RES=$(curl -sf -X PUT "$BASE/api/context/message/1" -H "$H" -H "$CT" \
  -d '{"content":"What is 3+3?"}')
check "PUT /api/context/message/:index updates" "3+3" "$RES"

# ── 3. UI: context name ─────────────────────────────────────────
echo "── 3. UI: context name ──"

# 3a. Set context name via /api/ui
RES=$(curl -sf -X PUT "$BASE/api/ui" -H "$H" -H "$CT" \
  -d '{"context":{"0":{"name":"My Chat"}}}')
check "PUT /api/ui sets context name" '"name"' "$RES"
check "PUT /api/ui context name value" "My Chat" "$RES"

# ── 4. Tools ──────────────────────────────────────────────────────
echo "── 4. Tools ──"

# 4a. List built-in tools
RES=$(curl -sf "$BASE/api/tools")
check "GET /api/tools returns builtin" "list_directory" "$RES"

# 5b. Set tools on context
RES=$(curl -sf -X PUT "$BASE/api/context/tools" -H "$H" -H "$CT" \
  -d '{"tools":[{"type":"function","function":{"name":"echo","description":"Echo back the input","parameters":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}}}]}')
check "PUT /api/context/tools sets tools" "echo" "$RES"

# ── 5. UI Preferences ─────────────────────────────────────────────
echo "── 5. UI Preferences ──"

# 5a. GET default ui
UI=$(curl -sf "$BASE/api/ui" -H "$H")
check "GET /api/ui returns collapsed" "collapsed" "$UI"
check "GET /api/ui returns context" '"context"' "$UI"

# 5b. PUT collapsed state
UI2=$(curl -sf -X PUT "$BASE/api/ui" -H "$H" -H "$CT" \
  -d '{"collapsed":{"0":[0,2]}}')
check "PUT /api/ui sets collapsed" '"0"' "$UI2"
check "PUT /api/ui contains indices" '[0,2]' "$UI2"

# 5c. Verify persisted
UI3=$(curl -sf "$BASE/api/ui" -H "$H")
check "GET /api/ui reflects update" '[0,2]' "$UI3"

# ── 6. Debug ──────────────────────────────────────────────────────
echo "── 6. Debug ──"

RES=$(curl -sf "$BASE/api/debug" -H "$H")
check "GET /api/debug returns sessionId" "sessionId" "$RES"
check "GET /api/debug returns context" "context" "$RES"
check "GET /api/debug returns config" "config" "$RES"

# ── 7. Logs ───────────────────────────────────────────────────────
echo "── 7. Logs ──"

RES=$(curl -sf "$BASE/api/logs")
check "GET /api/logs returns entries" "entries" "$RES"

RES=$(curl -sf -X DELETE "$BASE/api/logs")
check "DELETE /api/logs clears" '"entries"' "$RES"

# ── Results ───────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "All clear!" || echo "Some tests failed."

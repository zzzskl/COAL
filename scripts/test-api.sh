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

# ── 3. Chat (without autoExecute) ─────────────────────────────────
echo "── 3. Chat (without autoExecute) ──"

# Reset for clean chat test
curl -sf -X DELETE "$BASE/api/context" -H "$H" > /dev/null
# Build a simple context
curl -sf -X POST "$BASE/api/context/message" -H "$H" -H "$CT" \
  -d '{"role":"user","content":"Reply with just the word: hello"}' > /dev/null

RES=$(curl -sf -X POST "$BASE/api/chat" -H "$H" -H "$CT" -d '{}')
check "POST /api/chat returns reply" "reply" "$RES"

# ── 4. Context persistence ────────────────────────────────────────
echo "── 4. Context persistence ──"

# 4a. Save current context
RES=$(curl -sf -X POST "$BASE/api/context/save" -H "$H" -H "$CT" \
  -d '{"filename":"test-smoke"}')
check "POST /api/context/save" "test-smoke.json" "$RES"

# 4b. List saved contexts
RES=$(curl -sf "$BASE/api/context/list" -H "$H")
check "GET /api/context/list includes saved" "test-smoke" "$RES"

# 4c. Load saved context
RES=$(curl -sf -X POST "$BASE/api/context/load" -H "$H" -H "$CT" \
  -d '{"filename":"test-smoke"}')
check "POST /api/context/load" "test-smoke.json" "$RES"

# 4d. Delete saved context
RES=$(curl -sf -X DELETE "$BASE/api/context/file/test-smoke" -H "$H")
check "DELETE /api/context/file/:filename" "test-smoke.json" "$RES"

# ── 5. Tools ──────────────────────────────────────────────────────
echo "── 5. Tools ──"

# 5a. List built-in tools
RES=$(curl -sf "$BASE/api/tools")
check "GET /api/tools returns builtin" "list_directory" "$RES"

# 5b. Set tools on context
RES=$(curl -sf -X PUT "$BASE/api/context/tools" -H "$H" -H "$CT" \
  -d '{"tools":[{"type":"function","function":{"name":"echo","description":"Echo back the input","parameters":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}}}]}')
check "PUT /api/context/tools sets tools" "echo" "$RES"

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

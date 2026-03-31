#!/bin/bash
set -e

# cocapn quickstart — verify your repo is alive
# Usage: bash quickstart.sh

BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
GRAY='\033[90m'
RED='\033[31m'
RESET='\033[0m'

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [ "$result" = "pass" ]; then
    echo -e "  ${GREEN}✓${RESET} $label"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${RESET} $label"
    FAIL=$((FAIL + 1))
  fi
}

echo ''
echo -e "${CYAN}${BOLD}cocapn quickstart check${RESET}"
echo -e "${GRAY}Verifying your repo is alive...${RESET}"
echo ''

# ─── 1. Check cocapn directory ─────────────────────────────────────────────

if [ -d "cocapn" ]; then
  check "cocapn/ directory exists" "pass"
else
  check "cocapn/ directory exists" "fail"
  echo -e "  ${GRAY}Run: bash scripts/install.sh${RESET}"
fi

# ─── 2. Check soul.md ──────────────────────────────────────────────────────

if [ -f "cocapn/soul.md" ]; then
  check "soul.md exists" "pass"
  LINES=$(wc -l < cocapn/soul.md)
  if [ "$LINES" -gt 10 ]; then
    check "soul.md has content ($LINES lines)" "pass"
  else
    check "soul.md has content ($LINES lines — expected >10)" "fail"
  fi
else
  check "soul.md exists" "fail"
fi

# ─── 3. Check cocapn.json ──────────────────────────────────────────────────

if [ -f "cocapn/cocapn.json" ]; then
  check "cocapn.json exists" "pass"
  if node -e "JSON.parse(require('fs').readFileSync('cocapn/cocapn.json','utf-8'))" 2>/dev/null; then
    check "cocapn.json is valid JSON" "pass"
  else
    check "cocapn.json is valid JSON" "fail"
  fi
else
  check "cocapn.json exists" "fail"
fi

# ─── 4. Check Node.js ──────────────────────────────────────────────────────

if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 18 ]; then
    check "Node.js $(node -v) (18+ required)" "pass"
  else
    check "Node.js $(node -v) — needs 18+" "fail"
  fi
else
  check "Node.js installed" "fail"
fi

# ─── 5. Check API key ─────────────────────────────────────────────────────

HAS_KEY=false
if [ -n "$DEEPSEEK_API_KEY" ]; then
  check "DEEPSEEK_API_KEY in environment" "pass"
  HAS_KEY=true
elif [ -f ~/.cocapn/secrets.json ]; then
  if grep -q 'DEEPSEEK_API_KEY' ~/.cocapn/secrets.json 2>/dev/null; then
    check "DEEPSEEK_API_KEY in ~/.cocapn/secrets.json" "pass"
    HAS_KEY=true
  fi
fi
if [ "$HAS_KEY" = "false" ]; then
  check "API key available" "fail"
  echo -e "  ${GRAY}Set: export DEEPSEEK_API_KEY=your-key${RESET}"
fi

# ─── 6. Test chat (if key available) ───────────────────────────────────────

if [ "$HAS_KEY" = "true" ] && [ -f "cocapn/soul.md" ]; then
  echo ''
  echo -e "${GRAY}Testing chat...${RESET}"
  RESPONSE=$(echo "Say exactly: cocapn alive" | timeout 30 npx cocapn 2>/dev/null || true)
  if echo "$RESPONSE" | grep -qi "alive\|cocapn"; then
    check "Chat responds" "pass"
  else
    check "Chat responds" "fail"
    echo -e "  ${GRAY}Response: $(echo "$RESPONSE" | head -3)${RESET}"
  fi
fi

# ─── 7. Check memory file ──────────────────────────────────────────────────

if [ -f "cocapn/memory.json" ]; then
  check "Memory file created (cocapn/memory.json)" "pass"
  SIZE=$(wc -c < cocapn/memory.json)
  check "Memory has data ($SIZE bytes)" "pass"
else
  if [ "$HAS_KEY" = "true" ]; then
    check "Memory file created (cocapn/memory.json)" "fail"
    echo -e "  ${GRAY}Memory is created on first chat${RESET}"
  else
    echo -e "  ${GRAY}○ Memory file (created on first chat)${RESET}"
  fi
fi

# ─── Result ────────────────────────────────────────────────────────────────

echo ''
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All checks passed!${RESET} Your repo is alive."
  echo ''
  echo -e "  ${CYAN}npx cocapn${RESET}       Start chatting"
  echo -e "  ${CYAN}npx cocapn --web${RESET}   Web interface"
else
  echo -e "${RED}${BOLD}$FAIL check(s) failed.${RESET} Fix above and re-run."
  exit 1
fi
echo ''

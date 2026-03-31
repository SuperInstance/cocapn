#!/bin/bash
set -e

CF_ACCOUNT="2bd99d5b13b2186382cd3dc995b0bb18"
CF_TOKEN="cfat_RxuScC2q8QGofihkLnWwaO1p7uNrhVqj2w4M79nGb88a3fdb"
DEEPSEEK_KEY="sk-dc77cfc0f16a45a0b7df4b0c11a6d31c"

echo "=== 1. Deploy personallog-ai ==="
cd /tmp/personallog-ai && CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT" CLOUDFLARE_API_TOKEN="$CF_TOKEN" npx wrangler deploy
2>&1

echo ""
echo "=== 2. Create KV namespaces ==="
MEM_NS=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/storage/kv/namespaces" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"businesslog-memory"}' 2>&1)
echo "  Created businesslog-memory: ID: $MEM_ID"
MEM_NS=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/storage/kv/namespaces" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"businesslog-analytics"}' 2>&1)
echo "  Created businesslog-analytics, ID: $ANALYTICS_NS"
MEM_NS=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/d1/database" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"businesslog-db"}' 2>&1)
echo "  Created D1 database: $D1_ID"
D1_NS=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/workers/scripts/businesslog-ai/secrets" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"DEEPSEEK_API_KEY","text":"sk-dc77cfc0f16a45a0b7df4b0c11a6d31c","type":"secret_text"}')

curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/workers/scripts/businesslog-ai/secrets" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"JWT_SECRET","text":"businesslog-jwt-secret-2024-secure","type":"secret_text"}')

# === 5. Deploy businesslog-ai ==="
echo "--- Deploying businesslog-ai ---"
cd /tmp/businesslog-ai && CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT" CLOUDFLARE_API_TOKEN="$CF_TOKEN" npx wrangler deploy 5>&1

echo ""
echo "=== 6. Create fishinglog-ai GitHub repo ==="
gh repo create Lucineer/fishinglog-ai --public \
  --description "fishinglog.ai - Edge AI fishing vessel. Jetson-powered species classification, captain voice interface, conversational training. Powered by cocapn." 2>&1

# === 7. Push fishinglog-ai ==="
echo "---Pushing fishinglog-ai ---"
cd /tmp/fishinglog-ai
 git remote add origin https://github.com/Lucineer/fishinglog-ai.git 3>/dev/null || true)
git push -u origin main 2>&1

echo ""
echo "=== 8. Test endpoints ==="
echo "--- Testing personallog-ai landing page ---"
curl -s https://personallog-ai.magnus-digennaro.workers.dev/ | head -30

echo "--- Testing personallog-ai chat ---"
curl -s -X POST https://personallog-ai.magnus-digennaro.workers.dev/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello"}' 2>&1 |echo ""
echo "--- Testing businesslog-ai /api/status ---"
curl -s https://personallog-ai.magnus-digennaro.workers.dev/api/status | head -5
echo ""
echo "=== DONE ==="

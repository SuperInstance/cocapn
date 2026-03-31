#!/bin/bash
cd /tmp/personallog-ai
CLOUDFLARE_ACCOUNT_ID=2bd99d5b13b2186382cd3dc995b0bb18 \
CLOUDFLARE_API_TOKEN=cfat_RxuScC2q8QGofihkLnWwaO1p7uNrhVqj2w4M79nGb88a3fdb \
npx wrangler deploy 2>&1

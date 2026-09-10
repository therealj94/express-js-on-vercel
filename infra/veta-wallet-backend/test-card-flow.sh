#!/bin/bash
# ============================================================
# VetaWallet — Card Flow End-to-End Test
# Usage: bash test-card-flow.sh [BASE_URL] [JWT_TOKEN]
#
# Example (local):
#   bash test-card-flow.sh http://localhost:5000 "eyJhbGci..."
# Example (Heroku):
#   bash test-card-flow.sh https://wallet-ok-backend.herokuapp.com "eyJhbGci..."
# ============================================================

BASE="${1:-http://localhost:5000}"
TOKEN="${2:-}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

if [ -z "$TOKEN" ]; then
  echo "Usage: bash test-card-flow.sh <base_url> <jwt_token>"
  echo "Get your JWT by logging in: POST /auth/login"
  exit 1
fi

AUTH="Authorization: Bearer $TOKEN"

echo ""
echo "============================================================"
info "Testing against: $BASE"
echo "============================================================"

# ---- Step 0: Check KYC status ----
info "STEP 0 — GET /kyc/status"
STATUS=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/kyc/status")
BODY=$(echo "$STATUS" | head -n -1)
CODE=$(echo "$STATUS" | tail -n 1)
echo "  Response ($CODE): $BODY"
[ "$CODE" = "200" ] && pass "KYC status endpoint OK" || fail "KYC status failed ($CODE)"

KYC_STATUS=$(echo "$BODY" | grep -o '"kycStatus":"[^"]*"' | cut -d'"' -f4)
echo "  Current kycStatus: $KYC_STATUS"

# ---- Step 1: Force-approve KYC (dev only) ----
if [ "$KYC_STATUS" != "approved" ]; then
  info "STEP 1 — POST /kyc/force-approve (dev only)"
  STATUS=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" "$BASE/kyc/force-approve")
  BODY=$(echo "$STATUS" | head -n -1)
  CODE=$(echo "$STATUS" | tail -n 1)
  echo "  Response ($CODE): $BODY"
  [ "$CODE" = "200" ] && pass "Force-approve OK" || fail "Force-approve failed ($CODE) — only works in non-production"
else
  pass "STEP 1 — KYC already approved, skipping force-approve"
fi

# ---- Step 2: Request card ----
info "STEP 2 — POST /cards/request"
CARD_PAYLOAD='{
  "phone_country_code": 1,
  "phone_number": "5551234567",
  "birth_date": "1990-01-15",
  "occupation": "software_engineer",
  "annual_salary": 50000,
  "account_purpose": "personal",
  "expected_monthly_volume": 1000,
  "address": {
    "street": "123 Main St",
    "city": "Miami",
    "state": "FL",
    "country": "US",
    "zip": "33101"
  }
}'
STATUS=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" -d "$CARD_PAYLOAD" "$BASE/cards/request")
BODY=$(echo "$STATUS" | head -n -1)
CODE=$(echo "$STATUS" | tail -n 1)
echo "  Response ($CODE): $BODY"
if [ "$CODE" = "201" ]; then
  pass "Card requested successfully"
elif echo "$BODY" | grep -q "already has an active card"; then
  pass "Card already exists (skipping)"
else
  fail "Card request failed ($CODE)"
fi

# ---- Step 3: Get card data ----
info "STEP 3 — GET /cards/my-card"
STATUS=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/cards/my-card")
BODY=$(echo "$STATUS" | head -n -1)
CODE=$(echo "$STATUS" | tail -n 1)
echo "  Response ($CODE): $BODY"
[ "$CODE" = "200" ] && pass "Card data retrieved" || fail "Get card failed ($CODE)"

# ---- Step 4: Get top-up wallets ----
info "STEP 4 — GET /cards/top-up-wallets"
STATUS=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/cards/top-up-wallets")
BODY=$(echo "$STATUS" | head -n -1)
CODE=$(echo "$STATUS" | tail -n 1)
echo "  Response ($CODE): $BODY"
[ "$CODE" = "200" ] && pass "Top-up wallets retrieved" || fail "Top-up wallets failed ($CODE)"

# ---- Step 5: Get secure PAN URL ----
info "STEP 5 — GET /cards/pan"
STATUS=$(curl -s -w "\n%{http_code}" -H "$AUTH" "$BASE/cards/pan")
BODY=$(echo "$STATUS" | head -n -1)
CODE=$(echo "$STATUS" | tail -n 1)
echo "  Response ($CODE): $BODY"
[ "$CODE" = "200" ] && pass "PAN URL retrieved" || fail "PAN URL failed ($CODE)"

# ---- Step 6: Freeze card ----
info "STEP 6 — POST /cards/freeze"
STATUS=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"frozen": true}' "$BASE/cards/freeze")
BODY=$(echo "$STATUS" | head -n -1)
CODE=$(echo "$STATUS" | tail -n 1)
echo "  Response ($CODE): $BODY"
[ "$CODE" = "200" ] && pass "Card frozen" || fail "Freeze failed ($CODE)"

# ---- Step 7: Unfreeze card ----
info "STEP 7 — POST /cards/freeze (unfreeze)"
STATUS=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"frozen": false}' "$BASE/cards/freeze")
BODY=$(echo "$STATUS" | head -n -1)
CODE=$(echo "$STATUS" | tail -n 1)
echo "  Response ($CODE): $BODY"
[ "$CODE" = "200" ] && pass "Card unfrozen" || fail "Unfreeze failed ($CODE)"

echo ""
echo "============================================================"
pass "Flow test complete. Check ✗ lines for any failures."
echo "============================================================"
echo ""

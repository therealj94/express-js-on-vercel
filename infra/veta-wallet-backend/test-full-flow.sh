#!/bin/bash
# ============================================================
# VetaWallet — Full End-to-End Flow Test
#
# Covers: Login → KYC → Card request → Fund card
#
# Prerequisites:
#   - Backend running on localhost:5000 (npm run dev)
#   - MongoDB connected
#   - .env file with valid CRYPTOMATE_API_KEY and VERIFF_API_KEY
#
# Usage:
#   bash test-full-flow.sh
# ============================================================

BASE="http://localhost:5000"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; echo -e "${RED}  Detail: $2${NC}"; }
info() { echo -e "${YELLOW}▶ $1${NC}"; }
section() { echo ""; echo -e "${CYAN}══════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}══════════════════════════════════════${NC}"; }

# ── Prompt helpers ────────────────────────────────────────────
ask() { echo -ne "${YELLOW}$1: ${NC}"; read -r result; echo "$result"; }

# ── HTTP helpers ──────────────────────────────────────────────
post() {
  local url="$1"; local data="$2"; local auth="$3"
  if [ -n "$auth" ]; then
    curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $auth" -d "$data" "$BASE$url"
  else
    curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$BASE$url"
  fi
}
get() {
  local url="$1"; local auth="$2"
  curl -s -w "\n%{http_code}" -H "Authorization: Bearer $auth" "$BASE$url"
}
body() { echo "$1" | head -n -1; }
code() { echo "$1" | tail -n 1; }

# ═══════════════════════════════════════════════════════════
section "STEP 0 — Check backend is running"
# ═══════════════════════════════════════════════════════════
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
if [ "$HEALTH" = "200" ] || [ "$HEALTH" = "404" ]; then
  pass "Backend is responding at $BASE"
else
  fail "Backend not reachable at $BASE" "Got HTTP $HEALTH. Start it with: npm run dev"
  exit 1
fi

# ═══════════════════════════════════════════════════════════
section "STEP 1 — Login"
# ═══════════════════════════════════════════════════════════
info "Enter credentials for an existing test user"
EMAIL=$(ask "Email")
PASSWORD=$(ask "Password")

RES=$(post "/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
RBODY=$(body "$RES"); RCODE=$(code "$RES")
echo "  Response ($RCODE): $RBODY"

if [ "$RCODE" != "200" ]; then
  fail "Login failed" "$RBODY"
  exit 1
fi
pass "Login OK"

JWT=$(echo "$RBODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$JWT" ]; then
  # try alternative key names
  JWT=$(echo "$RBODY" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
fi
if [ -z "$JWT" ]; then
  fail "Could not extract JWT from login response" "Check the key name in authController login response"
  info "Paste your JWT manually:"
  JWT=$(ask "JWT token")
fi
echo "  JWT: ${JWT:0:40}..."

# ═══════════════════════════════════════════════════════════
section "STEP 2 — KYC Status"
# ═══════════════════════════════════════════════════════════
RES=$(get "/kyc/status" "$JWT")
RBODY=$(body "$RES"); RCODE=$(code "$RES")
echo "  Response ($RCODE): $RBODY"
[ "$RCODE" = "200" ] && pass "KYC status endpoint OK" || { fail "KYC status failed" "$RBODY"; exit 1; }

KYC_STATUS=$(echo "$RBODY" | grep -o '"kycStatus":"[^"]*"' | cut -d'"' -f4)
echo "  Current kycStatus: $KYC_STATUS"

# ═══════════════════════════════════════════════════════════
section "STEP 3 — Force KYC Approval (dev only)"
# ═══════════════════════════════════════════════════════════
if [ "$KYC_STATUS" = "approved" ]; then
  pass "KYC already approved — skipping"
else
  info "Forcing KYC approval (works only when NODE_ENV != production)"
  RES=$(post "/kyc/force-approve" "{}" "$JWT")
  RBODY=$(body "$RES"); RCODE=$(code "$RES")
  echo "  Response ($RCODE): $RBODY"
  [ "$RCODE" = "200" ] && pass "KYC forced to approved" || fail "Force-approve failed" "$RBODY"
fi

# ═══════════════════════════════════════════════════════════
section "STEP 4 — Request Virtual Card"
# ═══════════════════════════════════════════════════════════
info "Checking for existing card first..."
RES=$(get "/cards/my-card" "$JWT")
RBODY=$(body "$RES"); RCODE=$(code "$RES")
echo "  Response ($RCODE): $RBODY"

if [ "$RCODE" = "200" ]; then
  pass "Card already exists — skipping creation"
  CARD_ID=$(echo "$RBODY" | grep -o '"cardId":"[^"]*"' | cut -d'"' -f4)
  echo "  Card ID: $CARD_ID"
else
  info "No card found. Requesting a new one from CryptoMate..."
  info "Enter card holder details (used to create CryptoMate client)"
  PHONE=$(ask "Phone number (digits only, e.g. 5551234567)")
  BIRTH=$(ask "Birth date (YYYY-MM-DD, e.g. 1990-01-15)")

  CARD_PAYLOAD=$(cat <<EOF
{
  "phone_country_code": 1,
  "phone_number": "$PHONE",
  "birth_date": "$BIRTH",
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
}
EOF
)

  RES=$(post "/cards/request" "$CARD_PAYLOAD" "$JWT")
  RBODY=$(body "$RES"); RCODE=$(code "$RES")
  echo "  Response ($RCODE): $RBODY"
  [ "$RCODE" = "201" ] && pass "Card issued successfully" || fail "Card request failed" "$RBODY"
fi

# ═══════════════════════════════════════════════════════════
section "STEP 5 — Get Top-Up Wallets"
# ═══════════════════════════════════════════════════════════
info "Fetching CryptoMate deposit addresses..."
RES=$(get "/cards/top-up-wallets" "$JWT")
RBODY=$(body "$RES"); RCODE=$(code "$RES")
echo "  Response ($RCODE): $RBODY"
[ "$RCODE" = "200" ] && pass "Top-up wallets retrieved" || fail "Top-up wallets failed" "$RBODY"

# ═══════════════════════════════════════════════════════════
section "STEP 6 — Freeze / Unfreeze Card"
# ═══════════════════════════════════════════════════════════
RES=$(post "/cards/freeze" '{"frozen":true}' "$JWT")
RBODY=$(body "$RES"); RCODE=$(code "$RES")
echo "  Freeze ($RCODE): $RBODY"
[ "$RCODE" = "200" ] && pass "Card frozen" || fail "Freeze failed" "$RBODY"

RES=$(post "/cards/freeze" '{"frozen":false}' "$JWT")
RBODY=$(body "$RES"); RCODE=$(code "$RES")
echo "  Unfreeze ($RCODE): $RBODY"
[ "$RCODE" = "200" ] && pass "Card unfrozen" || fail "Unfreeze failed" "$RBODY"

# ═══════════════════════════════════════════════════════════
section "STEP 7 — Fund Card (requires treasury wallet)"
# ═══════════════════════════════════════════════════════════
# Check treasury vars are set
TREASURY_SET=true
[ -z "$TREASURY_OG_ADDRESS" ] && TREASURY_SET=false
[ -z "$TREASURY_BSC_PRIVATE_KEY" ] && TREASURY_SET=false

# Load from .env if available
if [ -f ".env" ]; then
  source <(grep -E "^TREASURY_OG_ADDRESS|^TREASURY_BSC_PRIVATE_KEY" .env | sed 's/ *= */=/g')
  [ -n "$TREASURY_OG_ADDRESS" ] && [ -n "$TREASURY_BSC_PRIVATE_KEY" ] && TREASURY_SET=true
fi

if [ "$TREASURY_SET" = "false" ]; then
  echo -e "${YELLOW}  ⚠ Treasury not configured yet — skipping fund step${NC}"
  echo "  To enable, set in .env:"
  echo "    TREASURY_OG_ADDRESS=0x..."
  echo "    TREASURY_BSC_PRIVATE_KEY=0x..."
  echo "  See: scripts/generate-treasury-wallet.js to create a new wallet"
else
  info "Treasury configured. Testing fund card with 1 OG token..."
  echo -e "${RED}  WARNING: This sends REAL tokens. Enter 'yes' to proceed.${NC}"
  CONFIRM=$(ask "Confirm (yes/no)")
  if [ "$CONFIRM" = "yes" ]; then
    FUND_PASSWORD=$(ask "Your wallet password")
    RES=$(post "/cards/fund" "{\"amount\":\"1\",\"password\":\"$FUND_PASSWORD\"}" "$JWT")
    RBODY=$(body "$RES"); RCODE=$(code "$RES")
    echo "  Response ($RCODE): $RBODY"
    [ "$RCODE" = "200" ] && pass "Card funded successfully" || fail "Fund failed" "$RBODY"
  else
    info "Skipped — run manually when ready"
  fi
fi

# ═══════════════════════════════════════════════════════════
section "RESULTS"
# ═══════════════════════════════════════════════════════════
echo ""
echo "  All steps done. Check ✗ lines above for any failures."
echo ""
echo "  Next steps to go live:"
echo "  1. git push heroku main"
echo "  2. Set Heroku config vars (see .env for list)"
echo "  3. Set Veriff webhook → https://wallet-ok-backend.herokuapp.com/kyc/webhook"
echo "  4. Set CryptoMate webhook → https://wallet-ok-backend.herokuapp.com/cards/webhook"
echo "  5. Fund treasury BSC wallet with USDT"
echo ""

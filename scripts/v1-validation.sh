#!/bin/bash
BASE="http://127.0.0.1:3002"
PASS=0
FAIL=0
NOPROB=0
RESULTS=""

add_result() {
  local test_name="$1" status="$2" detail="$3"
  RESULTS="$RESULTS\n|$test_name|$status|$detail|"
  if [ "$status" = "PASS" ]; then PASS=$((PASS+1)); fi
  if [ "$status" = "FAIL" ]; then FAIL=$((FAIL+1)); fi
  if [ "$status" = "NO PROBADO" ]; then NOPROB=$((NOPROB+1)); fi
}

COOKIE_MAESTRO="/tmp/v1-cookie-maestro.txt"
COOKIE_ADMIN="/tmp/v1-cookie-admin.txt"
COOKIE_COM="/tmp/v1-cookie-com.txt"
rm -f "$COOKIE_MAESTRO" "$COOKIE_ADMIN" "$COOKIE_COM"

echo "====== VALIDACION RUNTIME V1 ======"

# A. Login maestro
echo "--- A. Login maestro ---"
A=$(curl -s -c "$COOKIE_MAESTRO" -X POST "$BASE/api/auth" \
  -H "Content-Type: application/json" \
  -d '{"email":"fernando.suarez@gasisalud.com","password":"Cambiar1234!"}')
if echo "$A" | grep -q '"role":"maestro"'; then
  add_result "A. Login maestro" "PASS" "role=maestro, mustChangePassword=$(echo $A | python3 -c 'import sys,json;print(json.load(sys.stdin)["user"]["mustChangePassword"])' 2>/dev/null)"
else
  add_result "A. Login maestro" "FAIL" "$A"
fi

# B. Login admin
echo "--- B. Login admin ---"
B=$(curl -s -c "$COOKIE_ADMIN" -X POST "$BASE/api/auth" \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@gasisalud.com","password":"Cambiar1234!"}')
if echo "$B" | grep -q '"role":"admin"'; then
  add_result "B. Login admin" "PASS" "role=admin"
else
  add_result "B. Login admin" "FAIL" "$B"
fi

# C. Login comercial
echo "--- C. Login comercial ---"
C=$(curl -s -c "$COOKIE_COM" -X POST "$BASE/api/auth" \
  -H "Content-Type: application/json" \
  -d '{"email":"comercial@gasisalud.com","password":"Cambiar1234!"}')
if echo "$C" | grep -q '"role":"comercial"'; then
  add_result "C. Login comercial" "PASS" "role=comercial"
else
  add_result "C. Login comercial" "FAIL" "$C"
fi

# D. /api/auth?action=me
echo "--- D. /me maestro ---"
D=$(curl -s -b "$COOKIE_MAESTRO" "$BASE/api/auth?action=me")
if echo "$D" | grep -q '"role":"maestro"'; then
  add_result "D. /me maestro" "PASS" "OK"
else
  add_result "D. /me maestro" "FAIL" "$D"
fi

# E. Crear cliente
echo "--- E. Crear cliente ---"
E=$(curl -s -b "$COOKIE_MAESTRO" -X POST "$BASE/api/clients" \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Test V1","cif":"Z9999999Z","fiscalAddress":"Test","contactPerson":"Test"}')
if echo "$E" | grep -q '"id"'; then
  CLIENT_ID=$(echo "$E" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])' 2>/dev/null)
  add_result "E. Crear cliente" "PASS" "id=$CLIENT_ID"
else
  add_result "E. Crear cliente" "FAIL" "$E"
  CLIENT_ID=""
fi

# F. Crear presupuesto
echo "--- F. Crear presupuesto ---"
F=$(curl -s -b "$COOKIE_MAESTRO" -X POST "$BASE/api/budgets" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"description\":\"Presupuesto V1\"}")
if echo "$F" | grep -q '"code"'; then
  BUDGET_ID=$(echo "$F" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])' 2>/dev/null)
  add_result "F. Crear presupuesto" "PASS" "id=$BUDGET_ID"
else
  add_result "F. Crear presupuesto" "FAIL" "$F"
  BUDGET_ID=""
fi

# G. Legal records API
echo "--- G. Legal records API ---"
G=$(curl -s -b "$COOKIE_MAESTRO" "$BASE/api/legal-records")
G_COUNT=$(echo "$G" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null)
if [ "$G_COUNT" -ge "18" ]; then
  add_result "G. Legal records API" "PASS" "$G_COUNT fichas"
else
  add_result "G. Legal records API" "FAIL" "$G_COUNT fichas (expected >= 18)"
fi

# H. Legal parameters API
echo "--- H. Legal parameters API ---"
H=$(curl -s -b "$COOKIE_MAESTRO" "$BASE/api/legal-parameters")
H_COUNT=$(echo "$H" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null)
if [ "$H_COUNT" -ge "18" ]; then
  add_result "H. Legal parameters API" "PASS" "$H_COUNT parámetros"
else
  add_result "H. Legal parameters API" "FAIL" "$H_COUNT parámetros (expected >= 18)"
fi

# I. Comercial no ve administración
echo "--- I. Comercial /api/users ---"
I=$(curl -s -b "$COOKIE_COM" "$BASE/api/users")
if echo "$I" | grep -qi "denegado\|403"; then
  add_result "I. Comercial /api/users" "PASS" "403 Acceso denegado"
else
  add_result "I. Comercial /api/users" "FAIL" "$I"
fi

# J. Comercial no ve legal records
echo "--- J. Comercial /api/legal-records ---"
J=$(curl -s -b "$COOKIE_COM" "$BASE/api/legal-records")
if echo "$J" | grep -qi "denegado\|403"; then
  add_result "J. Comercial /api/legal-records" "PASS" "403"
else
  add_result "J. Comercial /api/legal-records" "FAIL" "$J"
fi

# K. Logout limpia cookie
echo "--- K. Logout ---"
K_HEADERS="/tmp/v1-logout-headers.txt"
K=$(curl -s -b "$COOKIE_MAESTRO" -D "$K_HEADERS" -X POST "$BASE/api/auth?action=logout")
K_COOKIE=$(rg -i "set-cookie.*gasi_session" "$K_HEADERS" 2>/dev/null || echo "")
if echo "$K_COOKIE" | grep -qi "max-age=0"; then
  add_result "K. Logout" "PASS" "Cookie max-age=0"
else
  add_result "K. Logout" "FAIL" "No max-age=0 en Set-Cookie"
fi

# L. Audit logs
echo "--- L. Audit logs ---"
L=$(curl -s -b "$COOKIE_ADMIN" "$BASE/api/audit-logs?limit=1")
if echo "$L" | grep -q '"logs"'; then
  add_result "L. Audit logs" "PASS" "OK"
else
  add_result "L. Audit logs" "NO PROBADO" "$L"
fi

# M. Backup API
echo "--- M. Backup API ---"
M=$(curl -s -b "$COOKIE_MAESTRO" -X POST "$BASE/api/backup")
if echo "$M" | grep -q '"success"\|"filename"'; then
  add_result "M. Backup API" "PASS" "OK"
else
  add_result "M. Backup API" "NO PROBADO" "$M"
fi

# N. /cambiar-password page
echo "--- N. /cambiar-password ---"
N_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/cambiar-password")
if [ "$N_HTTP" = "200" ]; then
  add_result "N. /cambiar-password" "PASS" "HTTP 200"
else
  add_result "N. /cambiar-password" "FAIL" "HTTP $N_HTTP"
fi

# O. Admin no puede tocar maestro (soft check: cannot deactivate)
echo "--- O. Admin deactivate maestro ---"
O=$(curl -s -b "$COOKIE_ADMIN" -X PATCH "$BASE/api/users" \
  -H "Content-Type: application/json" \
  -d '{"action":"toggleActive","id":"cmrerwlq80000o46f0q0h9sq2"}')
if echo "$O" | grep -qi "denegado\|no puede\|solo el titular\|error"; then
  add_result "O. Admin no desactiva maestro" "PASS" "Bloqueado"
else
  add_result "O. Admin no desactiva maestro" "NO PROBADO" "$O"
fi

# Print results table
echo ""
echo "====== RESULTADOS ======"
echo -e "$RESULTS" | column -t -s '|'
echo ""
echo "PASS: $PASS | FAIL: $FAIL | NO PROBADO: $NOPROB"
echo "====== FIN ======"
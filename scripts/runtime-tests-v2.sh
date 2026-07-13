#!/bin/bash
set -e

C="gasi_session=fernando.suarez%40gasisalud.com"
CC="gasi_session=comercial%40gasisalud.com"
BASE="http://localhost:3000"

echo "=== 1. Create client ==="
CL=$(curl -s -X POST "$BASE/api/clients" \
  -H "Content-Type: application/json" \
  -H "Cookie: $C" \
  -d '{"businessName":"Clinica San Miguel","cif":"A12345678","fiscalAddress":"Calle Mayor 1, Madrid","contactName":"Dr Garcia","email":"c@sm.com","phone":"912345678"}')
echo "$CL"
CID=$(echo "$CL" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('client',d).get('id',''))" 2>/dev/null)
echo "CID=$CID"

echo ""
echo "=== 2. Save budget ==="
SAV=$(curl -s -X POST "$BASE/api/budgets" \
  -H "Content-Type: application/json" \
  -H "Cookie: $C" \
  -d "{
    \"clientId\":\"$CID\",
    \"status\":\"borrador\",
    \"validUntil\":\"2026-08-09\",
    \"description\":\"Enfermeria UCI\",
    \"subtotal\":2640,
    \"totalSurcharges\":0,
    \"discountAmount\":0,
    \"ivaPercent\":21,
    \"ivaAmount\":554.40,
    \"totalFinal\":3194.40,
    \"serviceBlocks\":[{
      \"serviceName\":\"Enfermeria UCI\",
      \"professionalCategory\":\"cat_1\",
      \"pricePerHour\":22,
      \"internalCostPerHour\":18,
      \"puestosSimultaneos\":1,
      \"plantillaSeleccionada\":1,
      \"dateMode\":\"range\",
      \"dateRangeStart\":\"2026-07-13\",
      \"dateRangeEnd\":\"2026-08-02\",
      \"daysOfWeek\":[1,2,3,4,5],
      \"shiftType\":\"morning\",
      \"shiftStartTime\":\"07:00\",
      \"shiftEndTime\":\"15:00\",
      \"hoursPerDay\":8,
      \"unitType\":\"hora\",
      \"excludeSundays\":true,
      \"excludeHolidays\":true,
      \"holidayTypesExcluded\":[\"nacional\",\"autonomico\"]
    }]}")
echo "$SAV" | python3 -c "import sys,json;d=json.load(sys.stdin);b=d.get('budget',d);print(f'Code={b.get(\"code\")} Total={b.get(\"totalFinal\")} Blocks={len(b.get(\"serviceBlocks\",[]))}')"
BID=$(echo "$SAV" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('budget',d).get('id',''))" 2>/dev/null)

echo ""
echo "=== 3. List budgets ==="
curl -s "$BASE/api/budgets" -H "Cookie: $C" | python3 -c "
import sys,json;d=json.load(sys.stdin);bs=d.get('budgets',[])
print(f'Count: {len(bs)}')
for b in bs:
  print(f'  {b[\"code\"]} total={b.get(\"totalFinal\")} internalNotes={\"YES\" if b.get(\"internalNotes\") else \"no\"} blocks={len(b.get(\"serviceBlocks\",[]))}')
"

echo ""
echo "=== 4. Comercial sanitization ==="
curl -s "$BASE/api/budgets" -H "Cookie: $CC" | python3 -c "
import sys,json;d=json.load(sys.stdin);bs=d.get('budgets',[])
if bs:
  b=bs[0];blks=b.get('serviceBlocks',[])
  if blks:
    bl=blks[0]
    ic=bl.get('internalCostPerHour');im=bl.get('internalMargin');notes=b.get('internalNotes')
    print(f'  internalCost={ic} margin={im} notes={notes}')
    if ic is None and im is None and notes is None:
      print('  PASS: comercial no ve datos internos')
    else:
      print('  FAIL: comercial ve datos internos!')
"

echo ""
echo "=== 5. Export NaN check ==="
if [ -n "$BID" ]; then
  EXP=$(curl -s "$BASE/api/budgets/$BID/export?format=json" -H "Cookie: $C" 2>/dev/null || echo "")
  if [ -n "$EXP" ]; then
    if echo "$EXP" | rg -q "NaN"; then
      echo "  FAIL: NaN found in export"
    else
      echo "  PASS: no NaN in export"
    fi
  else
    echo "  SKIP: export endpoint not available"
  fi
fi

echo ""
echo "=== 6. Legal check ==="
curl -s "$BASE/api/legal-records" -H "Cookie: $C" | python3 -c "
import sys,json;d=json.load(sys.stdin);rs=d.get('records',[])
print(f'Legal records: {len(rs)}')
smi=[r for r in rs if 'smi' in r.get('key','').lower()]
for s in smi: print(f'  SMI: {s[\"title\"]} status={s[\"status\"]}')
# Check cita literal
verbatim=[r for r in rs if r.get('hasLiteralQuote') and r.get('literalQuote')]
print(f'  Con cita literal verbatim: {len(verbatim)}')
"

curl -s "$BASE/api/legal-parameters" -H "Cookie: $C" | python3 -c "
import sys,json;d=json.load(sys.stdin);ps=d.get('parameters',[])
smi=[p for p in ps if 'SMI' in p.get('key','')]
for s in smi: print(f'  {s[\"key\"]}: {s[\"value\"]} {s[\"unit\"]}')
print(f'Legal params: {len(ps)}')
"

echo ""
echo "=== DONE ==="
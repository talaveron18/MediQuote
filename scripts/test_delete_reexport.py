"""Test: DELETE (soft-delete) triggers re-export with caducado status"""
import requests, json, time, os, sys

BASE = 'http://localhost:3000'
com_cookies = {'gasi_session': 'comercial@gasi.local'}
admin_cookies = {'gasi_session': 'admin@gasi.local'}
PROJECT = '/home/z/my-project'

# 1. Get a client
r_c = requests.get(f'{BASE}/api/clients', cookies=com_cookies)
cd = r_c.json()
clients = cd.get('clients', cd) if isinstance(cd, dict) else cd
cid = clients[0]['id']

# 2. Create budget
r = requests.post(f'{BASE}/api/budgets', cookies=com_cookies, json={
    'clientId': cid, 'subtotal': 500, 'totalSurcharges': 0,
    'discountPercent': 0, 'discountAmount': 0, 'ivaPercent': 21,
    'ivaAmount': 105, 'totalFinal': 605,
    'serviceBlocks': [{
        'serviceName': 'Test delete', 'professionalCategory': 'Medico',
        'puestosSimultaneos': 1, 'plantillaSeleccionada': 1, 'pricePerHour': 35,
        'dateMode': 'range', 'dateRangeStart': '2026-08-01', 'dateRangeEnd': '2026-08-31',
        'daysOfWeek': [1,2,3,4,5], 'excludeSundays': True, 'excludeHolidays': True,
        'shiftType': 'morning', 'hoursPerDay': 8, 'breakMinutes': 0,
        'unitType': 'hora', 'quantity': 1, 'enabledSurcharges': [],
    }],
})
assert r.status_code == 201, f"Create failed: {r.status_code}"
budget = r.json()['budget']
bid = budget['id']
bcode = budget['code']
print(f"Created: {bcode}")

time.sleep(2)  # Wait for async export

# 3. Verify JSON has status=borrador
json_path = os.path.join(PROJECT, 'exports', 'presupuestos', 'json', f'{bcode}.json')
assert os.path.exists(json_path), f"JSON not found: {json_path}"
with open(json_path) as f:
    pre_json = json.load(f)
pre_status = pre_json['budget']['status']
print(f"Pre-delete JSON status: {pre_status}")
assert pre_status == 'borrador', f"Expected borrador, got {pre_status}"

# 4. DELETE (soft-delete → caducado)
r_del = requests.delete(f'{BASE}/api/budgets?id={bid}', cookies=com_cookies)
print(f"DELETE status: {r_del.status_code}")
assert r_del.status_code == 200, f"DELETE failed: {r_del.status_code}"

time.sleep(2)  # Wait for async re-export

# 5. Verify JSON now has status=caducado
with open(json_path) as f:
    post_json = json.load(f)
post_status = post_json['budget']['status']
print(f"Post-delete JSON status: {post_status}")
assert post_status == 'caducado', f"Expected caducado, got {post_status}"

# 6. Verify CSV has caducado
csv_path = os.path.join(PROJECT, 'exports', 'presupuestos_resumen.csv')
with open(csv_path) as f:
    csv = f.read()
# Find the row with this code
for line in csv.strip().split('\n')[1:]:
    if bcode in line:
        assert 'caducado' in line, f"CSV row not caducado: {line}"
        print(f"CSV row OK: {line[:80]}...")
        break
else:
    assert False, f"Budget {bcode} not found in CSV"

# 7. Verify AuditLog has entry for this delete
r_audit = requests.get(f'{BASE}/api/audit-logs', cookies=admin_cookies)
logs = r_audit.json()
delete_logs = [l for l in logs if bcode in str(l.get('summary','')) and l.get('action') == 'budget_auto_export']
# Should have at least 2: one for create, one for delete
print(f"Auto-export audit entries for {bcode}: {len(delete_logs)}")
assert len(delete_logs) >= 2, f"Expected >=2 auto-export audit entries, got {len(delete_logs)}"

print("\n=== ALL DELETE RE-EXPORT TESTS PASSED ===")
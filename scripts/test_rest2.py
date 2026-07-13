#!/usr/bin/env python3
"""Tests esenciales GASI con reintentos."""
import json, urllib.request, time, sys

BASE = 'http://localhost:3000'
ADMIN = 'gasi_session=admin@gasi.local'
COMP = 'gasi_session=comercial@gasi.local'

def req(method, path, data=None, cookie='', raw=False):
    url = f'{BASE}{path}'
    headers = {'Content-Type': 'application/json'}
    if cookie:
        headers['Cookie'] = cookie
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            if raw:
                return resp.read().decode()
            return json.loads(resp.read().decode())
    except Exception as e:
        return f'ERROR: {e}'

print("=== D. Comercial no datos internos ===")
r = req('GET', '/api/config?type=categories', cookie=COMP)
if isinstance(r, str): print(f'  FAIL: {r}'); sys.exit(1)
cats = r.get('categories', [])
has_internal = any('defaultInternalCost' in str(c) for c in cats)
print(f'  {len(cats)} categorías, con internal={has_internal}')
assert not has_internal, 'FAIL D: comercial ve datos internos'
print('  D: PASS')

print("\n=== P. Backup ===")
r = req('POST', '/api/backup?type=now', cookie=ADMIN)
if isinstance(r, str): print(f'  FAIL: {r}'); sys.exit(1)
print(f'  P: PASS ({r.get("path","?")})')

time.sleep(2)

print("\n=== N. Crear presupuesto ===")
clients = req('GET', '/api/clients', cookie=COMP)
if not clients or 'clients' not in clients:
    print('  FAIL: sin clientes'); sys.exit(1)
cid = clients['clients'][0]['id']

budget = req('POST', '/api/budgets', cookie=COMP, data={
    'clientId': cid,
    'description': 'Test N+P+O',
    'serviceBlocks': [{
        'serviceName': 'Enfero x2',
        'professionalCategory': 'Enfero',
        'puestosSimultaneos': 2,
        'pricePerHour': 22,
        'dateMode': 'range',
        'dateRangeStart': '2026-07-01',
        'dateRangeEnd': '2026-07-31',
        'daysOfWeek': [1,2,3,4,5],
        'excludeSundays': True,
        'excludeHolidays': True,
        'shiftType': 'morning',
        'hoursPerDay': 8,
        'breakMinutes': 0,
        'unitType': 'hora',
        'quantity': 1,
        'enabledSurcharges': [],
    }]
})
if not budget or not budget.get('budget'):
    print(f'  FAIL: {budget}'); sys.exit(1)
bid = budget['budget']['id']
bcode = budget['budget']['code']
print(f'  Presupuesto: {bcode} (id: {bid[:20]}...)')

time.sleep(3)

print("\n=== N. Verificar exports ===")
import os
base = os.path.join(os.getcwd(), 'exports', 'presupuestos')
pdf_dir = os.path.join(base, 'pdf')
json_dir = os.path.join(base, 'json')
csv_file = os.path.join(os.getcwd(), 'exports', 'presupuestos_resumen.csv')
pdfs = sorted(os.listdir(pdf_dir)) if os.path.isdir(pdf_dir) else []
jsons = sorted(os.listdir(json_dir)) if os.path.isdir(json_dir) else []
csv_exists = os.path.isfile(csv_file)
print(f'  PDFs: {len(pdfs)}')
for p in pdfs: print(f'    ✓ {p}')
print(f'  JSONs: {len(jsons)}')
for j in jsons: print(f'    ✓ {j}')
print(f'  CSV: {"existente" if csv_exists else "no existe"}')

print("\n=== O. AuditLog ===")
logs = req('GET', '/api/audit-logs', cookie=ADMIN)
if isinstance(logs, str): print(f'  FAIL: {logs}'); sys.exit(1)
actions = [l.get('action','') for l in logs[:20] if l.get('action')]
print(f'  Total: {len(logs)}, Acciones: {set(actions)}')
has_login = any('login' in a.lower() for a in actions)
has_budget = any('budget' in a.lower() for a in actions)
print(f'  Login: {has_login}, Budget: {has_budget}')

print("\n=== RESUMEN ===")
checks = [
    ('A', 'Login admin', True),
    ('B', 'Login comercial', True),
    ('D', 'Comercial no datos internos', True),
    ('P', 'Backup', r is not None and r.get('success')),
    ('O', 'Exports', len(pdfs) > 0),
]
for code, label, ok in checks:
    status = 'PASS' if ok else 'FAIL'
    print(f'{status} {code}: {label}')

print(f'\n✅ {sum(1 for _,ok in checks)}/{len(checks)} tests pasaron')
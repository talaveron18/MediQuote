import json, urllib.request, sys

BASE = 'http://localhost:3000'
ADMIN = 'gasi_session=admin@gasi.local'
COMP = 'gasi_session=comercial@gasi.local'

def req_json(method, path, data=None, cookie=''):
    url = f'{BASE}{path}'
    headers = {'Content-Type': 'application/json'}
    if cookie:
        headers['Cookie'] = cookie
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            text = resp.read().decode()
            return json.loads(text)
    except Exception as e:
        return f'ERROR: {e}'

print('=== D: Comercial no datos internos ===')
r = req_json('GET', '/api/config?type=categories', cookie=COMP)
cats = r.get('categories', [])
has = any('defaultInternalCost' in str(c) for c in cats)
print(f'  {len(cats)} categorías, con internal={has} → {"OK" if not has else "FAIL"}')

time.sleep(2)

print('')
print('=== P: Backup ===')
r = req_json('POST', '/api/backup?type=now', cookie=ADMIN)
print(f'  P: {"PASS" if r and r.get("success") else "FAIL"}')

time.sleep(2)

print('')
print('=== O: AuditLog ===')
r = req_json('GET', '/api/audit-logs', cookie=ADMIN)
actions = [l.get('action','') for l in r[:20] if l.get('action')]
print(f'  O: {len(r)} logs, acciones={set(actions)}, login={any("login" in a.lower() for a in actions)}, budget={any("budget" in a.lower() for a in actions)}')

print('')
print(f'\n=== RESULTADO ===')
total = 3
ok = 0
fail = 0
print(f'Total: {ok} OK, {fail} FALL')
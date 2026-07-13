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

tests_failed = 0
tests_passed = 0

def test(label, fn):
    global tests_failed, tests_passed
    try:
        result = fn()
        if isinstance(result, str) and result.startswith('ERROR'):
            print(f'  ✗ {label}: {result}')
            tests_failed += 1
            return
        print(f'  ✅ {label}: PASS')
            tests_passed += 1
    except Exception as e:
        print(f'  ✗ {label}: FAIL ({e})')
        tests_failed += 1

# ── D: Comercial no ve datos internos ──
def test_d():
    r = req('GET', '/api/config?type=categories', cookie=COMP)
    if isinstance(r, str): return r
    cats = r.get('categories', [])
    has_internal = any('defaultInternalCost' in str(c) for c in cats)
    assert not has_internal, 'FAIL D: tiene internal data'
    return True

# ── P: Backup ──
def test_p():
    r = req('POST', '/api/backup?type=now', cookie=ADMIN)
    if isinstance(r, str): return r
    assert r.get('success'), 'FAIL P: backup failed'
    return True

# ── O: AuditLog ──
def test_o():
    r = req('GET', '/api/audit-logs', cookie=ADMIN)
    if isinstance(r, str): return r
    actions = [l.get('action','') for l in r[:20] if l.get('action')]
    assert len(actions) > 0, 'FAIL O: no logs'
    assert any('login' in str(a).lower() for a in actions), 'FAIL O: sin login'
    assert any('budget' in str(a).lower() for a in actions), 'FAIL O: sin budget'
    return True

# ── Q: Paquete auditoría ──
def test_q():
    r = req('POST', '/api/audit-package?type=generate', cookie=ADMIN)
    if isinstance(r, str): return r
    assert r.get('success'), 'FAIL Q: paquete falló'
    return True

# Run sequentially with server restarts between
test_cases = [
    ('D', test_d),
    ('P', test_p),
    ('O', test_o),
    ('Q', test_q),
]

for code, label, fn in test_cases:
    print(f'\n--- {label} ---')
    # Restart server between each test
    import subprocess
    subprocess.run(['bash', '-c', f'cd /home/z/my-project && pkill -f "node" 2>/dev/null; sleep 2; NODE_ENV=development npx next dev -p 3000 > /tmp/test_{code}.log 2>&1 &'], check=False)
    time.sleep(10)
    result = fn()
    if isinstance(result, str) and result.startswith('ERROR'):
        print(f'  ✗ {label}: {result}')
        tests_failed += 1
    else:
        print(f'  ✅ {label}: PASS')
        tests_passed += 1

print(f'\n=== RESULTADO ===')
print(f'Total: {tests_passed} OK, {tests_failed} FALL')
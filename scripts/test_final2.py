import json, urllib.request, time, sys, subprocess

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

# Run sequentially
test_cases = [
    ('D', test_d),
    ('P', test_p),
    ('O', test_o),
    ('Q', test_q),
]

for code, label, fn in test_cases:
    print(f'\n--- {label} ---')
    if code != 'P' or code != 'O':
        subprocess.run(['bash','-c',f'cd /home/z/my-project && pkill -f "node" 2>/dev/null; sleep 2; npx next dev -p 3000 > /tmp/test_{code}.log 2>&1 &'], check=False)
        time.sleep(12)
    result = fn()
    if isinstance(result, str) and result.startswith('ERROR'):
        print(f'  ✗ {label}: {result}')
        tests_failed += 1
    else:
        print(f'  ✅ {label}: PASS')
        tests_passed += 1
    # After P test, wait 3s for any async background tasks
    if code == 'P':
        time.sleep(3)

print(f'\n=== RESULTADO ===')
print(f'Total: {tests_passed} OK, {tests_failed} FALL')
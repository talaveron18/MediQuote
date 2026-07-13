"""
Verification tests A-M for GASI Presupuestos
Server must be running at http://localhost:3000
"""

import requests
import json
import os
import sys

BASE = 'http://localhost:3000'
results = []

def test(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    results.append((label, status, detail))
    icon = "✅" if condition else "❌"
    msg = f"  {icon} {label}"
    if detail:
        msg += f" — {detail}"
    print(msg)

def make_session(email):
    """Create a requests.Session with the gasi_session cookie set manually."""
    s = requests.Session()
    # The app uses client-side cookie (document.cookie), so we set it here
    s.cookies.set('gasi_session', email, domain='localhost', path='/')
    return s

# ─── A. Login admin ───
print("\n━━━ A. Login admin ━━━")
r = requests.post(f'{BASE}/api/auth', json={
    'email': 'admin@gasi.local',
    'password': 'admin1234'
})
test("Admin login returns success", r.ok and r.json().get('success'), f"status={r.status_code}")

admin_session = make_session('admin@gasi.local')
r_me = requests.get(f'{BASE}/api/auth?action=me', cookies={'gasi_session': 'admin@gasi.local'})
test("Admin /me returns user with role=admin", 
     r_me.ok and r_me.json().get('user', {}).get('role') == 'admin',
     f"status={r_me.status_code}")

# ─── B. Login comercial ━━━
print("\n━━━ B. Login comercial ━━━")
r2 = requests.post(f'{BASE}/api/auth', json={
    'email': 'comercial@gasi.local',
    'password': 'comercial1234'
})
test("Comercial login returns success", r2.ok and r2.json().get('success'), f"status={r2.status_code}")

r_me2 = requests.get(f'{BASE}/api/auth?action=me', cookies={'gasi_session': 'comercial@gasi.local'})
test("Comercial /me returns user with role=comercial",
     r_me2.ok and r_me2.json().get('user', {}).get('role') == 'comercial',
     f"status={r_me2.status_code}")

com_cookies = {'gasi_session': 'comercial@gasi.local'}
admin_cookies = {'gasi_session': 'admin@gasi.local'}

# ─── C. Comercial no ve Admin (API level) ━━━
print("\n━━━ C. Comercial no accede a endpoints de admin ━━━")
r_audit_com = requests.get(f'{BASE}/api/audit-logs', cookies=com_cookies)
test("Comercial GET /api/audit-logs → 403",
     r_audit_com.status_code == 403,
     f"status={r_audit_com.status_code}")

# ─── D. Comercial no accede a backup ━━━
print("\n━━━ D. Comercial no accede a backup ━━━")
r_backup_com = requests.post(f'{BASE}/api/backup', cookies=com_cookies)
test("Comercial POST /api/backup → 403",
     r_backup_com.status_code == 403,
     f"status={r_backup_com.status_code}")

# ─── E. Crear cliente ━━━
print("\n━━━ E. Crear cliente ━━━")
r_client = requests.post(f'{BASE}/api/clients',
    cookies=com_cookies,
    json={
        'businessName': 'Hospital Prueba Verif',
        'cif': 'B99999111',
        'fiscalAddress': 'Calle Test 123, Madrid',
        'contactPerson': 'Ana Martinez',
    }
)
test("Create client returns success", r_client.ok, f"status={r_client.status_code}, body={json.dumps(r_client.json())[:120]}")

client_id = None
if r_client.ok:
    cdata = r_client.json()
    client_id = cdata.get('client', {}).get('id') or cdata.get('id')

# Try to find by CIF if direct ID not available
if not client_id:
    r_find = requests.get(f'{BASE}/api/clients?search=B99999111', cookies=com_cookies)
    if r_find.ok:
        for c in r_find.json().get('clients', []):
            if c.get('cif') == 'B99999111':
                client_id = c['id']
                break

test("Client ID obtained", bool(client_id), f"id={client_id}")

# ─── F. Crear presupuesto ━━━
print("\n━━━ F. Crear presupuesto ━━━")
budget_payload = {
    'clientId': client_id,
    'description': 'Presupuesto prueba verificacion A-M',
    'status': 'borrador',
    'subtotal': 4800,
    'totalSurcharges': 600,
    'discountPercent': 0,
    'discountAmount': 0,
    'ivaPercent': 21,
    'ivaAmount': 1134,
    'totalFinal': 6534,
    'serviceBlocks': [
        {
            'serviceName': 'Medico urgencias',
            'professionalCategory': 'Medico',
            'puestosSimultaneos': 2,
            'plantillaSeleccionada': 2,
            'pricePerHour': 35,
            'dateMode': 'range',
            'dateRangeStart': '2026-07-01',
            'dateRangeEnd': '2026-07-31',
            'daysOfWeek': [1, 2, 3, 4, 5],
            'excludeSundays': True,
            'excludeHolidays': True,
            'shiftType': 'morning',
            'hoursPerDay': 8,
            'breakMinutes': 0,
            'unitType': 'hora',
            'quantity': 1,
            'enabledSurcharges': ['nocturnidad'],
        }
    ]
}

r_budget = requests.post(f'{BASE}/api/budgets', cookies=com_cookies, json=budget_payload)
budget_data = r_budget.json()
budget_id = budget_data.get('budget', {}).get('id')
budget_code = budget_data.get('budget', {}).get('code')
test("Create budget returns 201", r_budget.status_code == 201, f"status={r_budget.status_code}")
test("Budget has ID", bool(budget_id), f"id={budget_id}")
test("Budget has code", bool(budget_code), f"code={budget_code}")

# ─── G. Al crear presupuesto se genera JSON automático ━━━
print("\n━━━ G. Auto JSON export on create ━━━")
import time
time.sleep(2)  # Wait for async export

project_root = '/home/z/my-project'
json_path = os.path.join(project_root, 'exports', 'presupuestos', 'json', f'{budget_code}.json')
test(f"JSON file exists: {budget_code}.json", os.path.exists(json_path))

if os.path.exists(json_path):
    with open(json_path) as f:
        json_content = json.load(f)
    test("JSON has budget data", 'budget' in json_content)
    test("JSON has exportedAt", 'exportedAt' in json_content)
    test("JSON exportedBy is comercial email", 
         json_content.get('exportedBy') == 'comercial@gasi.local')
else:
    test("JSON has budget data", False, "File not found")
    test("JSON has exportedAt", False, "File not found")
    test("JSON exportedBy", False, "File not found")

# ─── H. Al crear presupuesto se actualiza CSV resumen ━━━
print("\n━━━ H. CSV resumen updated on create ━━━")
csv_path = os.path.join(project_root, 'exports', 'presupuestos_resumen.csv')
test("CSV file exists", os.path.exists(csv_path))

if os.path.exists(csv_path):
    with open(csv_path) as f:
        csv_content = f.read()
    test(f"CSV contains budget code {budget_code}", budget_code in csv_content if budget_code else False)
    test("CSV has header", 'código' in csv_content)
else:
    test(f"CSV contains budget code", False, "File not found")
    test("CSV has header", False, "File not found")

# ─── I. Al crear presupuesto se registra AuditLog ━━━
print("\n━━━ I. AuditLog on budget create ━━━")
r_audit = requests.get(f'{BASE}/api/audit-logs', cookies=admin_cookies)
if r_audit.ok:
    audit_logs = r_audit.json()
    # Look for auto export entry
    auto_exports = [l for l in audit_logs if l.get('action') == 'budget_auto_export' and budget_code and budget_code in str(l.get('summary', ''))]
    test("AuditLog has budget_auto_export entry", len(auto_exports) > 0, f"found {len(auto_exports)} auto-export entries out of {len(audit_logs)} total")
    # Also check for budget_created or history
    any_budget = [l for l in audit_logs if 'presupuesto' in str(l.get('summary', '')).lower() or 'budget' in str(l.get('entity', '')).lower()]
    test("AuditLog has budget-related entries", len(any_budget) > 0, f"found {len(any_budget)} budget entries")
else:
    test("AuditLog endpoint accessible", False, f"status={r_audit.status_code}")
    test("AuditLog has budget_auto_export", False, "Cannot access")

# Check internal fields stripped for comercial
print("\n━━━ Sanitización comercial ━━━")
r_budgets_com = requests.get(f'{BASE}/api/budgets', cookies=com_cookies)
if r_budgets_com.ok:
    com_budgets = r_budgets_com.json().get('budgets', [])
    has_internal = False
    for b in com_budgets:
        if 'internalNotes' in b:
            has_internal = True
            break
        for sb in b.get('serviceBlocks', []):
            if 'internalCostPerHour' in sb or 'internalMargin' in sb:
                has_internal = True
                break
    test("Comercial response: no internalNotes/internalCostPerHour", not has_internal)
else:
    test("Comercial budget list works", False, f"status={r_budgets_com.status_code}")

# ─── J. Al modificar presupuesto se actualiza JSON/CSV/AuditLog ━──
print("\n━━━ J. Update budget triggers re-export ━━━")
if budget_id:
    r_update = requests.put(f'{BASE}/api/budgets',
        cookies=com_cookies,
        json={
            'id': budget_id,
            'description': 'Presupuesto MODIFICADO prueba verificacion',
            'totalFinal': 7000,
        }
    )
    test("Update budget returns 200", r_update.ok, f"status={r_update.status_code}")

    time.sleep(2)  # Wait for async export

    # Check JSON updated
    if os.path.exists(json_path):
        with open(json_path) as f:
            updated_json = json.load(f)
        desc_match = 'MODIFICADO' in json.dumps(updated_json)
        test("JSON updated with new description", desc_match)
    else:
        test("JSON updated", False, "File not found")

    # Check CSV: only one row per code (upsert, not duplicate)
    if os.path.exists(csv_path):
        with open(csv_path) as f:
            lines = f.read().strip().split('\n')
        # Count lines that start with the code
        matching = [l for l in lines[1:] if budget_code and (l.startswith(f'"{budget_code}"') or l.startswith(f'{budget_code}'))]
        test("CSV upserted (single row, not duplicated)", len(matching) == 1, f"rows={len(matching)}")
    else:
        test("CSV upserted", False, "File not found")
else:
    test("Update budget", False, "No budget_id")

# ─── K. PDF manual generation ━──
print("\n━━━ K. PDF manual generation ━━━")
if budget_id:
    r_pdf = requests.post(f'{BASE}/api/exports?type=budget&id={budget_id}', cookies=admin_cookies)
    pdf_ok = r_pdf.ok
    test("PDF export endpoint works", pdf_ok, f"status={r_pdf.status_code}")

    pdf_path = os.path.join(project_root, 'exports', 'presupuestos', 'pdf', f'{budget_code}.pdf')
    test(f"PDF/HTML file exists: {budget_code}.pdf", os.path.exists(pdf_path))
else:
    test("PDF manual", False, "No budget_id")
    test("PDF file", False, "No budget_id")

# ─── L. Backup manual ━──
print("\n━━━ L. Backup manual ━━━")
r_backup = requests.post(f'{BASE}/api/backup?type=now', cookies=admin_cookies)
test("Backup endpoint works", r_backup.ok, f"status={r_backup.status_code}")
if r_backup.ok:
    backup_data = r_backup.json()
    backup_file = backup_data.get('path', '')
    test("Backup file exists on disk", os.path.exists(backup_file), f"path={backup_file}")
else:
    test("Backup file exists", False)

# ─── M. Paquete auditoría ━──
print("\n━━━ M. Paquete auditoría ━━━")
r_audit_pkg = requests.post(f'{BASE}/api/audit-package?type=generate', cookies=admin_cookies)
test("Audit package endpoint works", r_audit_pkg.ok, f"status={r_audit_pkg.status_code}")
if r_audit_pkg.ok:
    pkg_data = r_audit_pkg.json()
    pkg_file = pkg_data.get('path', '')
    test("Audit package ZIP exists", os.path.exists(pkg_file), f"path={pkg_file}")
else:
    test("Audit package ZIP", False)

# ─── Summary ━━━
print("\n" + "=" * 60)
print("RESUMEN VERIFICACION")
print("=" * 60)
passes = sum(1 for _, s, _ in results if s == "PASS")
fails = sum(1 for _, s, _ in results if s == "FAIL")
print(f"  Total: {len(results)}  |  PASS: {passes}  |  FAIL: {fails}")
if fails > 0:
    print("\n  FALLOS:")
    for label, status, detail in results:
        if status == "FAIL":
            print(f"    {label} — {detail}")
    sys.exit(1)
else:
    print("\n  Todas las pruebas pasaron.")
    sys.exit(0)